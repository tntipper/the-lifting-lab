// Fixture-only executable for separately approved Stage 3 Keychain behavior
// qualification. Compile this file with staging-provider-noninteractive-keychain.swift
// and -D TLL_KEYCHAIN_FIXTURE. It has no CLI or environment configuration.
import Darwin
import CryptoKit
import Foundation
import Security

#if !TLL_KEYCHAIN_FIXTURE
#error("The fixture source must only be compiled with TLL_KEYCHAIN_FIXTURE")
#endif

private let TLL_FIXTURE_NATIVE_ENABLED = true
private let tllFixtureDirectory = NSHomeDirectory() + "/Library/Caches/tll-stage3-keychain-fixture"
private let tllFixturePath = tllFixtureDirectory + "/tll-stage3-fixture.keychain-db"
private let tllFixturePassword = Array("tll-stage3-fixture-passphrase-v1".utf8)
private let tllFixtureValue = Array("tll-stage3-fixture-value-v1".utf8)
private let tllFixtureServiceAttribute: UInt32 = 0x73766365 // 'svce'
private let tllFixtureAccountAttribute: UInt32 = 0x61636374 // 'acct'
private let tllFixtureGenericPasswordClass = SecItemClass(rawValue: 0x67656E70)! // 'genp'

private enum TLLFixtureExit: Int32 {
    case pass = 0
    case guardFailed = 11
    case setupHold = 30
    case unexpectedRead = 31
    case cleanupHold = 32
    case journalHold = 33
}

private enum TLLFixtureOperation: String {
    case create = "CREATE", allowedItem = "ALLOWED_ITEM", deniedItem = "DENIED_ITEM", aclCheck = "ACL_CHECK"
    case readAllowed = "READ_ALLOWED", readMissing = "READ_MISSING", readDenied = "READ_DENIED"
    case lock = "LOCK", readLocked = "READ_LOCKED", unlock = "UNLOCK", cleanup = "CLEANUP"
}

private enum TLLFixtureJournalStatus: String { case intent = "INTENT", complete = "COMPLETE" }

// The real journal uses POSIX I/O. Offline tests inject a fake port so a
// failed write, file sync, rename, or directory sync can never be mistaken for
// a durable operation intent.
private struct TLLFixtureJournalIO {
    let openFile: (String, Int32, mode_t) -> Int32
    let writeChunk: (Int32, UnsafeRawPointer, Int) -> Int
    let sync: (Int32) -> Int32
    let closeFile: (Int32) -> Int32
    let renameFile: (String, String) -> Int32

    static let real = TLLFixtureJournalIO(
        openFile: { path, flags, mode in path.withCString { Darwin.open($0, flags, mode) } },
        writeChunk: { fd, pointer, count in Darwin.write(fd, pointer, count) },
        sync: { fd in Darwin.fsync(fd) },
        closeFile: { fd in Darwin.close(fd) },
        renameFile: { old, new in old.withCString { oldPath in
            new.withCString { newPath in Darwin.rename(oldPath, newPath) }
        } }
    )
}

// Pure state guard shared by the durable writer. It is deliberately free of
// Security.framework calls so its ordering and deadline rules can be tested.
private struct TLLFixtureJournalState {
    let runId: String
    let deadlineMs: Int64
    private(set) var sequence = 0
    private(set) var lastOperation: TLLFixtureOperation?
    private(set) var awaitingCompletion = false
    private var nextIndex = 0
    private let order: [TLLFixtureOperation] = [.create, .allowedItem, .deniedItem, .aclCheck,
        .readAllowed, .readMissing, .readDenied, .lock, .readLocked, .unlock, .cleanup]

    mutating func begin(_ operation: TLLFixtureOperation, nowMs: Int64) -> Bool {
        guard nowMs < deadlineMs, !awaitingCompletion, nextIndex < order.count,
              operation == order[nextIndex] || (operation == .cleanup && sequence > 0) else { return false }
        lastOperation = operation; awaitingCompletion = true; return true
    }
    mutating func finish(_ operation: TLLFixtureOperation, nowMs: Int64) -> Bool {
        guard nowMs < deadlineMs, awaitingCompletion, lastOperation == operation else { return false }
        awaitingCompletion = false; sequence += 2
        nextIndex = operation == .cleanup ? order.count : nextIndex + 1
        return true
    }
}

private struct TLLFixtureIntent {
    let runId: String
    let sourceSha256: String
    let fixtureSha256: String
    let binarySha256: String
    let deadlineAt: String
    let deadlineMs: Int64
    let phaseDeadlineAt: String
    let phaseDeadlineMs: Int64
}

private final class TLLFixtureNativeJournal {
    private let receipt: URL
    private let directory: URL
    private let intent: TLLFixtureIntent
    private var sequence = 0
    private var state: TLLFixtureJournalState
    private let now: () -> Date

    init?(now: @escaping () -> Date = Date.init) {
        self.now = now
        let cwd = URL(fileURLWithPath: FileManager.default.currentDirectoryPath, isDirectory: true).standardizedFileURL
        guard cwd.lastPathComponent == "implementation-integration" else { return nil }
        let staging = cwd.deletingLastPathComponent().appendingPathComponent("implementation-state/staging", isDirectory: true)
        guard TLLFixtureNativeJournal.privateDirectory(staging.path),
              let intent = TLLFixtureNativeJournal.loadIntent(staging: staging, repository: cwd, now: now) else { return nil }
        self.directory = staging
        self.receipt = staging.appendingPathComponent("tll-provider-keychain-fixture-native-v1.json")
        guard !FileManager.default.fileExists(atPath: receipt.path) else { return nil }
        self.intent = intent
        self.state = TLLFixtureJournalState(runId: intent.runId,
                                            deadlineMs: min(intent.deadlineMs, intent.phaseDeadlineMs))
    }

    func intent(_ operation: TLLFixtureOperation) -> Bool { persist(operation, .intent, outcome: nil, category: nil) }
    func complete(_ operation: TLLFixtureOperation, _ outcome: String, category: String) -> Bool {
        persist(operation, .complete, outcome: outcome, category: category)
    }

    private func persist(_ operation: TLLFixtureOperation, _ status: TLLFixtureJournalStatus, outcome: String?, category: String?) -> Bool {
        let beforeMs = Int64(now().timeIntervalSince1970 * 1_000)
        var nextState = state
        guard status == .intent ? nextState.begin(operation, nowMs: beforeMs)
            : nextState.finish(operation, nowMs: beforeMs) else { return false }
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let timestamp = formatter.string(from: now())
        let body: [String: Any] = [
            "schema": "tll-stage3-disposable-keychain-native/v1", "runId": intent.runId,
            "sourceSha256": intent.sourceSha256, "fixtureSha256": intent.fixtureSha256,
            "binarySha256": intent.binarySha256, "runDeadlineAt": intent.deadlineAt,
            "phaseDeadlineAt": intent.phaseDeadlineAt,
            "sequence": sequence, "operation": operation.rawValue, "status": status.rawValue,
            "updatedAt": timestamp, "outcome": outcome.map { $0 as Any } ?? NSNull(),
            "category": category.map { $0 as Any } ?? NSNull(),
        ]
        guard let data = try? JSONSerialization.data(withJSONObject: body, options: [.sortedKeys]), data.count <= 4_096 else { return false }
        let result = sequence == 0 ? Self.writeExclusive(data, to: receipt.path, directory: directory.path)
            : Self.writeAtomic(data, to: receipt.path, temporary: directory.appendingPathComponent(".tll-native-fixture-\(intent.runId)-\(sequence).tmp").path, directory: directory.path)
        guard result else { return false }
        guard Int64(now().timeIntervalSince1970 * 1_000) < nextState.deadlineMs else { return false }
        state = nextState
        sequence += 1
        return true
    }

    func mayEnterSecurityOperation() -> Bool {
        state.awaitingCompletion && Int64(now().timeIntervalSince1970 * 1_000) < state.deadlineMs
    }

    private static func privateDirectory(_ path: String) -> Bool {
        var info = stat()
        return lstat(path, &info) == 0 && (info.st_mode & mode_t(S_IFMT)) == mode_t(S_IFDIR)
            && info.st_uid == getuid() && (info.st_mode & 0o777) == 0o700
    }

    private static func regularPrivateFile(_ path: String) -> Bool {
        var info = stat()
        return lstat(path, &info) == 0 && (info.st_mode & mode_t(S_IFMT)) == mode_t(S_IFREG)
            && info.st_uid == getuid() && info.st_nlink == 1 && (info.st_mode & 0o777) == 0o600 && info.st_size <= 4_096
    }

    private static func sha256(_ url: URL) -> String? {
        guard let data = try? Data(contentsOf: url) else { return nil }
        return SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
    }

    private static func loadIntent(staging: URL, repository: URL, now: () -> Date) -> TLLFixtureIntent? {
        let path = staging.appendingPathComponent("tll-provider-keychain-fixture-v1.json")
        guard regularPrivateFile(path.path), let data = try? Data(contentsOf: path),
              let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              Set(object.keys) == Set(["schema", "runId", "sourceSha256", "fixtureSha256", "binarySha256", "sequence", "phase", "startedAt", "updatedAt", "phaseDeadlineAt", "runDeadlineAt", "outcome"]),
              object["schema"] as? String == "tll-stage3-disposable-keychain-fixture/v1",
              object["phase"] as? String == "NATIVE_ATTEMPT", object["outcome"] is NSNull,
              let runId = object["runId"] as? String, runId.range(of: "^[0-9a-f-]{36}$", options: .regularExpression) != nil,
              let source = object["sourceSha256"] as? String, let fixture = object["fixtureSha256"] as? String,
              let binary = object["binarySha256"] as? String, [source, fixture, binary].allSatisfy({ $0.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil }),
              let deadlineAt = object["runDeadlineAt"] as? String,
              let deadline = TLLFixtureNativeJournal.parseTimestamp(deadlineAt)?.timeIntervalSince1970,
              let phaseDeadlineAt = object["phaseDeadlineAt"] as? String,
              let phaseDeadline = TLLFixtureNativeJournal.parseTimestamp(phaseDeadlineAt)?.timeIntervalSince1970,
              min(deadline, phaseDeadline) * 1_000 > now().timeIntervalSince1970 * 1_000,
              sha256(repository.appendingPathComponent("scripts/staging-provider-noninteractive-keychain.swift")) == source,
              sha256(repository.appendingPathComponent("scripts/staging-provider-keychain-fixture-native.swift")) == fixture
        else { return nil }
        return TLLFixtureIntent(runId: runId, sourceSha256: source, fixtureSha256: fixture,
                                binarySha256: binary, deadlineAt: deadlineAt,
                                deadlineMs: Int64(deadline * 1_000),
                                phaseDeadlineAt: phaseDeadlineAt,
                                phaseDeadlineMs: Int64(phaseDeadline * 1_000))
    }

    fileprivate static func parseTimestamp(_ value: String) -> Date? {
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return fractional.date(from: value) ?? ISO8601DateFormatter().date(from: value)
    }

    fileprivate static func writeAll(_ data: Data, writeChunk: (UnsafeRawPointer, Int) -> Int) -> Bool {
        var offset = 0
        return data.withUnsafeBytes { bytes in
            guard let base = bytes.baseAddress else { return false }
            while offset < bytes.count {
                let count = writeChunk(base.advanced(by: offset), bytes.count - offset)
                if count < 0 && errno == EINTR { continue }
                guard count > 0 && count <= bytes.count - offset else { return false }
                offset += count
            }
            return true
        }
    }

    private static func writeAll(_ fd: Int32, _ data: Data, io: TLLFixtureJournalIO) -> Bool {
        writeAll(data) { pointer, count in io.writeChunk(fd, pointer, count) }
    }

    fileprivate static func writeExclusive(_ data: Data, to path: String, directory: String,
                                           io: TLLFixtureJournalIO = .real) -> Bool {
        var fd = io.openFile(path, O_WRONLY | O_CREAT | O_EXCL | O_NOFOLLOW, 0o600)
        guard fd >= 0 else { return false }
        defer { if fd >= 0 { _ = io.closeFile(fd) } }
        guard writeAll(fd, data, io: io), io.sync(fd) == 0,
              io.closeFile(fd) == 0 else { return false }
        fd = -1
        var directoryFD = io.openFile(directory, O_RDONLY | O_DIRECTORY | O_NOFOLLOW, 0)
        guard directoryFD >= 0 else { return false }
        defer { if directoryFD >= 0 { _ = io.closeFile(directoryFD) } }
        guard io.sync(directoryFD) == 0, io.closeFile(directoryFD) == 0 else { return false }
        directoryFD = -1
        return true
    }

    fileprivate static func writeAtomic(_ data: Data, to path: String, temporary: String,
                                        directory: String, io: TLLFixtureJournalIO = .real) -> Bool {
        var fd = io.openFile(temporary, O_WRONLY | O_CREAT | O_EXCL | O_NOFOLLOW, 0o600)
        guard fd >= 0 else { return false }
        defer { if fd >= 0 { _ = io.closeFile(fd) } }
        guard writeAll(fd, data, io: io), io.sync(fd) == 0, io.closeFile(fd) == 0 else { return false }
        fd = -1
        guard io.renameFile(temporary, path) == 0 else { return false }
        var directoryFD = io.openFile(directory, O_RDONLY | O_DIRECTORY | O_NOFOLLOW, 0)
        guard directoryFD >= 0 else { return false }
        defer { if directoryFD >= 0 { _ = io.closeFile(directoryFD) } }
        guard io.sync(directoryFD) == 0, io.closeFile(directoryFD) == 0 else { return false }
        directoryFD = -1
        return true
    }
}

private enum TLLFixtureCategory: String {
    case notRun = "NOT_RUN"
    case success = "SUCCESS"
    case interactionRequired = "INTERACTION_REQUIRED"
    case authenticationFailed = "AUTHENTICATION_FAILED"
    case itemMissing = "ITEM_MISSING"
    case keychainUnavailable = "KEYCHAIN_UNAVAILABLE"
    case configurationFailed = "CONFIGURATION_FAILED"
    case decodeFailed = "DECODE_FAILED"
    case cancelled = "CANCELLED"
    case invalidOutput = "INVALID_OUTPUT"
    case interactionControlFailed = "INTERACTION_CONTROL_FAILED"
    case restorationFailed = "RESTORATION_FAILED"
    case outputFailed = "OUTPUT_FAILED"
    case unclassified = "UNCLASSIFIED"

    init(_ result: TLLCredentialExit) {
        switch result {
        case .success: self = .success
        case .interactionRequired: self = .interactionRequired
        case .authenticationFailed: self = .authenticationFailed
        case .itemMissing: self = .itemMissing
        case .keychainUnavailable: self = .keychainUnavailable
        case .configurationFailed: self = .configurationFailed
        case .decodeFailed: self = .decodeFailed
        case .cancelled: self = .cancelled
        case .invalidOutput: self = .invalidOutput
        case .interactionControlFailed: self = .interactionControlFailed
        case .restorationFailed: self = .restorationFailed
        case .outputFailed: self = .outputFailed
        case .guardFailed, .unclassified: self = .unclassified
        }
    }
}

private struct TLLFixtureOutcome {
    var setup = "HOLD"
    var allowed = TLLFixtureCategory.notRun
    var missing = TLLFixtureCategory.notRun
    var denied = TLLFixtureCategory.notRun
    var locked = TLLFixtureCategory.notRun
    var allowedExact = "NOT_RUN"
    var cleanup = "NOT_RUN"

    func emit() {
        // Fixed-only data: fixture credentials and passphrases never leave the process.
        print("{\"schema\":\"tll-stage3-keychain-fixture/v1\",\"setup\":\"\(setup)\",\"allowed\":\"\(allowed.rawValue)\",\"missing\":\"\(missing.rawValue)\",\"denied\":\"\(denied.rawValue)\",\"locked\":\"\(locked.rawValue)\",\"allowedExact\":\"\(allowedExact)\",\"cleanup\":\"\(cleanup)\"}")
    }
}

private func tllWithInteractionDisabled<T>(_ body: () -> T?) -> T? {
    var prior: DarwinBoolean = false
    guard SecKeychainGetUserInteractionAllowed(&prior) == errSecSuccess else { return nil }
    guard SecKeychainSetUserInteractionAllowed(false) == errSecSuccess else {
        _ = SecKeychainSetUserInteractionAllowed(prior.boolValue)
        return nil
    }
    let value = body()
    guard SecKeychainSetUserInteractionAllowed(prior.boolValue) == errSecSuccess else { return nil }
    return value
}

private func tllFixtureDirectoryIsPrivate() -> Bool {
    var info = stat()
    return lstat(tllFixtureDirectory, &info) == 0
        && (info.st_mode & mode_t(S_IFMT)) == mode_t(S_IFDIR)
        && info.st_uid == getuid()
        && (info.st_mode & 0o777) == 0o700
}

private struct TLLFixtureFileIdentity: Equatable {
    let device: dev_t
    let inode: ino_t
    let owner: uid_t
    let kind: mode_t
    let permissions: mode_t
    let links: nlink_t

    static func read(_ path: String, kind: mode_t) -> TLLFixtureFileIdentity? {
        var info = stat()
        guard lstat(path, &info) == 0, info.st_uid == getuid(),
              (info.st_mode & mode_t(S_IFMT)) == kind,
              (info.st_mode & 0o077) == 0,
              (kind != mode_t(S_IFREG) || info.st_nlink == 1) else { return nil }
        return TLLFixtureFileIdentity(device: info.st_dev, inode: info.st_ino, owner: info.st_uid,
                                      kind: kind, permissions: info.st_mode & 0o777, links: info.st_nlink)
    }
}

private func tllKeychainPath(_ keychain: SecKeychain) -> String? {
    var bytes = [CChar](repeating: 0, count: 4_096)
    var length = UInt32(bytes.count)
    guard SecKeychainGetPath(keychain, &length, &bytes) == errSecSuccess,
          length < UInt32(bytes.count) else { return nil }
    return String(cString: bytes)
}

private struct TLLKeychainBaseline: Equatable {
    let defaultPath: String
    let searchPaths: [String]
}

private func tllCaptureKeychainBaselineUnsafe() -> TLLKeychainBaseline? {
    var defaultKeychain: SecKeychain?
    var searchList: CFArray?
    guard SecKeychainCopyDefault(&defaultKeychain) == errSecSuccess,
          let defaultKeychain, let defaultPath = tllKeychainPath(defaultKeychain),
          SecKeychainCopySearchList(&searchList) == errSecSuccess,
          let searchList else { return nil }
    let entries = searchList as NSArray
    var paths: [String] = []
    for index in 0..<entries.count {
        let raw = CFArrayGetValueAtIndex(searchList, index)
        let object = unsafeBitCast(raw, to: CFTypeRef.self)
        guard CFGetTypeID(object) == SecKeychainGetTypeID() else { return nil }
        let keychain = unsafeBitCast(raw, to: SecKeychain.self)
        guard let path = tllKeychainPath(keychain) else { return nil }
        paths.append(path)
    }
    return TLLKeychainBaseline(defaultPath: defaultPath, searchPaths: paths)
}

private func tllCaptureKeychainBaseline() -> TLLKeychainBaseline? {
    // Although metadata reads should not authenticate, enforce the same
    // no-interaction setting used by every fixture lifecycle operation.
    tllWithInteractionDisabled { tllCaptureKeychainBaselineUnsafe() }
}

private func tllCreateAccess(trustSelf: Bool) -> SecAccess? {
    var access: SecAccess?
    if trustSelf {
        var application: SecTrustedApplication?
        guard SecTrustedApplicationCreateFromPath(nil, &application) == errSecSuccess, let application else { return nil }
        guard SecAccessCreate("TLL Stage 3 fixture allowed" as CFString, [application] as CFArray, &access) == errSecSuccess else { return nil }
    } else {
        // An explicit empty array means no application is trusted without a prompt.
        guard SecAccessCreate("TLL Stage 3 fixture denied" as CFString, [] as CFArray, &access) == errSecSuccess else { return nil }
    }
    return access
}

private func tllTrustedApplicationData(_ application: SecTrustedApplication) -> CFData? {
    var data: CFData?
    return SecTrustedApplicationCopyData(application, &data) == errSecSuccess ? data : nil
}

private func tllAuthorizationGrantsRead(_ authorization: CFString) -> Bool {
    CFEqual(authorization, kSecACLAuthorizationDecrypt)
        || CFEqual(authorization, kSecACLAuthorizationAny)
}

private func tllVerifyFixtureAccess(_ item: SecKeychainItem, trustSelf: Bool) -> Bool {
    var access: SecAccess?
    guard SecKeychainItemCopyAccess(item, &access) == errSecSuccess, let access else { return false }
    var aclList: CFArray?
    guard SecAccessCopyACLList(access, &aclList) == errSecSuccess, let aclList else { return false }
    var expected: SecTrustedApplication?
    if trustSelf {
        guard SecTrustedApplicationCreateFromPath(nil, &expected) == errSecSuccess,
              expected != nil else { return false }
    }
    var matchingDecryptACLs = 0
    for index in 0..<CFArrayGetCount(aclList) {
        let raw = CFArrayGetValueAtIndex(aclList, index)
        let object = unsafeBitCast(raw, to: CFTypeRef.self)
        guard CFGetTypeID(object) == SecACLGetTypeID() else { return false }
        let acl = unsafeBitCast(raw, to: SecACL.self)
        let authorizations = SecACLCopyAuthorizations(acl)
        var decrypts = false
        for authorizationIndex in 0..<CFArrayGetCount(authorizations) {
            let authorizationRaw = CFArrayGetValueAtIndex(authorizations, authorizationIndex)
            let authorizationObject = unsafeBitCast(authorizationRaw, to: CFTypeRef.self)
            guard CFGetTypeID(authorizationObject) == CFStringGetTypeID() else { return false }
            let authorization = unsafeBitCast(authorizationRaw, to: CFString.self)
            if tllAuthorizationGrantsRead(authorization) { decrypts = true }
        }
        guard decrypts else { continue }
        matchingDecryptACLs += 1
        var applications: CFArray?
        var description: CFString?
        var prompt = SecKeychainPromptSelector()
        guard SecACLCopyContents(acl, &applications, &description, &prompt) == errSecSuccess,
              let applications else { return false }
        if !trustSelf {
            guard CFArrayGetCount(applications) == 0 else { return false }
            continue
        }
        guard CFArrayGetCount(applications) == 1 else { return false }
        let applicationRaw = CFArrayGetValueAtIndex(applications, 0)
        let applicationObject = unsafeBitCast(applicationRaw, to: CFTypeRef.self)
        guard CFGetTypeID(applicationObject) == SecTrustedApplicationGetTypeID() else { return false }
        let actual = unsafeBitCast(applicationRaw, to: SecTrustedApplication.self)
        guard let actualData = tllTrustedApplicationData(actual),
              let expected, let expectedData = tllTrustedApplicationData(expected),
              CFEqual(actualData, expectedData) else { return false }
    }
    return matchingDecryptACLs == 1
}

private func tllCreateFixtureItem(_ selector: TLLCredentialItem, access: SecAccess, keychain: SecKeychain) -> SecKeychainItem? {
    var service = Array(selector.service.utf8)
    var account = Array(selector.account.utf8)
    defer { service.withUnsafeMutableBytes { memset_s($0.baseAddress, $0.count, 0, $0.count) }; account.withUnsafeMutableBytes { memset_s($0.baseAddress, $0.count, 0, $0.count) } }
    return service.withUnsafeMutableBytes { serviceBuffer in
        account.withUnsafeMutableBytes { accountBuffer in
            var attributes = [
                SecKeychainAttribute(tag: tllFixtureServiceAttribute, length: UInt32(serviceBuffer.count), data: serviceBuffer.baseAddress),
                SecKeychainAttribute(tag: tllFixtureAccountAttribute, length: UInt32(accountBuffer.count), data: accountBuffer.baseAddress),
            ]
            return attributes.withUnsafeMutableBufferPointer { attributeBuffer in
                var list = SecKeychainAttributeList(count: UInt32(attributeBuffer.count), attr: attributeBuffer.baseAddress)
                return tllFixtureValue.withUnsafeBytes { valueBuffer in
                    var item: SecKeychainItem?
                    let status = SecKeychainItemCreateFromContent(tllFixtureGenericPasswordClass, &list,
                        UInt32(valueBuffer.count), valueBuffer.baseAddress, keychain, access, &item)
                    return status == errSecSuccess ? item : nil
                }
            }
        }
    }
}

private func tllFixtureRead(_ selector: String, port: TLLRealKeychainPort,
                            exactValue: inout Bool) -> TLLFixtureCategory {
    let result = tllReadOnce(selector, port: port) { bytes in
        let isExact = bytes.count == tllFixtureValue.count && bytes.elementsEqual(tllFixtureValue)
        exactValue = exactValue || isExact
        return isExact
    }
    return TLLFixtureCategory(result)
}

private func tllFixtureDelete(_ keychain: SecKeychain, fileIdentity: TLLFixtureFileIdentity,
                              directoryIdentity: TLLFixtureFileIdentity) -> Bool {
    guard tllKeychainPath(keychain) == tllFixturePath,
          TLLFixtureFileIdentity.read(tllFixturePath, kind: mode_t(S_IFREG)) == fileIdentity,
          TLLFixtureFileIdentity.read(tllFixtureDirectory, kind: mode_t(S_IFDIR)) == directoryIdentity
    else { return false }
    guard tllWithInteractionDisabled({ () -> Bool in
        SecKeychainDelete(keychain) == errSecSuccess
    }) == true else { return false }
    return TLLFixtureFileIdentity.read(tllFixtureDirectory, kind: mode_t(S_IFDIR)) == directoryIdentity
        && !FileManager.default.fileExists(atPath: tllFixturePath)
}

private func tllFixtureUnlock(_ keychain: SecKeychain) -> Bool {
    var password = tllFixturePassword
    defer {
        _ = password.withUnsafeMutableBytes { buffer in
            memset_s(buffer.baseAddress, buffer.count, 0, buffer.count)
        }
    }
    return tllWithInteractionDisabled {
        password.withUnsafeBytes { buffer in
            SecKeychainUnlock(keychain, UInt32(buffer.count), buffer.baseAddress, true) == errSecSuccess
        }
    } == true
}

#if !TLL_FIXTURE_NATIVE_TEST
@main private struct TLLFixtureMain {
    static func main() {
        guard TLL_FIXTURE_NATIVE_ENABLED else { Darwin.exit(TLLFixtureExit.guardFailed.rawValue) }
        Darwin.exit(run())
    }

    private static func run() -> Int32 {
        guard CommandLine.arguments.count == 1, tllFixtureDirectoryIsPrivate() else {
            return TLLFixtureExit.setupHold.rawValue
        }
        guard let baseline = tllCaptureKeychainBaseline() else { return TLLFixtureExit.setupHold.rawValue }
        guard let journal = TLLFixtureNativeJournal() else { return TLLFixtureExit.journalHold.rawValue }

        var outcome = TLLFixtureOutcome()
        var keychain: SecKeychain?
        var allowedItem: SecKeychainItem?
        var deniedItem: SecKeychainItem?
        var verifiedFixture = false
        var fixtureIdentity: TLLFixtureFileIdentity?
        let directoryIdentity = TLLFixtureFileIdentity.read(tllFixtureDirectory, kind: mode_t(S_IFDIR))
        var journalFailure = false
        func operation(_ name: TLLFixtureOperation, _ work: () -> Bool, category: () -> String? = { nil }) -> Bool {
            guard journal.intent(name) else { journalFailure = true; return false }
            guard journal.mayEnterSecurityOperation() else { journalFailure = true; return false }
            let result = work()
            let resultCategory = result ? (category() ?? "PASS") : (category() ?? "HOLD")
            guard journal.complete(name, result ? "PASS" : "HOLD", category: resultCategory) else { journalFailure = true; return false }
            return result
        }
        func cleanup() -> Bool {
            operation(.cleanup) {
                guard let keychain, let fixtureIdentity, let directoryIdentity else { return false }
                return tllFixtureDelete(keychain, fileIdentity: fixtureIdentity,
                                        directoryIdentity: directoryIdentity)
                    && tllCaptureKeychainBaseline() == baseline
            }
        }
        defer {
            if let keychain, verifiedFixture, outcome.cleanup == "NOT_RUN" {
                outcome.cleanup = !journalFailure && cleanup() ? "PASS" : "HOLD"
            }
            // Swift ARC releases the Core Foundation references after this scope.
            _ = allowedItem
            _ = deniedItem
            _ = keychain
            outcome.emit()
        }

        let created = operation(.create) { tllWithInteractionDisabled { () -> Bool in
            guard !FileManager.default.fileExists(atPath: tllFixturePath) else { return false }
            let status = tllFixturePassword.withUnsafeBytes { passwordBuffer in
                SecKeychainCreate(tllFixturePath, UInt32(passwordBuffer.count), passwordBuffer.baseAddress,
                                  false, nil, &keychain)
            }
            guard status == errSecSuccess, let keychain, tllKeychainPath(keychain) == tllFixturePath,
                  let identity = TLLFixtureFileIdentity.read(tllFixturePath, kind: mode_t(S_IFREG)),
                  TLLFixtureFileIdentity.read(tllFixtureDirectory, kind: mode_t(S_IFDIR)) == directoryIdentity
            else { return false }
            fixtureIdentity = identity
            verifiedFixture = true
            return true
        } == true }
        guard created, let keychain else { return journalFailure ? TLLFixtureExit.journalHold.rawValue : TLLFixtureExit.setupHold.rawValue }
        var allowedAccess: SecAccess?
        guard operation(.allowedItem, { tllWithInteractionDisabled {
            allowedAccess = tllCreateAccess(trustSelf: true)
            guard let allowedAccess else { return false }
            allowedItem = tllCreateFixtureItem(.fixtureAllowed, access: allowedAccess, keychain: keychain)
            return allowedItem != nil
        } == true }) else { return journalFailure ? TLLFixtureExit.journalHold.rawValue : TLLFixtureExit.setupHold.rawValue }
        var deniedAccess: SecAccess?
        guard operation(.deniedItem, { tllWithInteractionDisabled {
            deniedAccess = tllCreateAccess(trustSelf: false)
            guard let deniedAccess else { return false }
            deniedItem = tllCreateFixtureItem(.fixtureDenied, access: deniedAccess, keychain: keychain)
            return deniedItem != nil
        } == true }) else { return journalFailure ? TLLFixtureExit.journalHold.rawValue : TLLFixtureExit.setupHold.rawValue }
        guard operation(.aclCheck, { tllWithInteractionDisabled {
            guard let allowedItem, let deniedItem else { return false }
            return tllVerifyFixtureAccess(allowedItem, trustSelf: true) && tllVerifyFixtureAccess(deniedItem, trustSelf: false)
        } == true }) else { return journalFailure ? TLLFixtureExit.journalHold.rawValue : TLLFixtureExit.setupHold.rawValue }
        outcome.setup = "PASS"
        guard tllCaptureKeychainBaseline() == baseline else { return TLLFixtureExit.setupHold.rawValue }

        let port = TLLRealKeychainPort(keychain: keychain)
        var allowedExact = false
        guard operation(.readAllowed, { outcome.allowed = tllFixtureRead("fixture-allowed", port: port, exactValue: &allowedExact); return outcome.allowed == .success }, category: { outcome.allowed.rawValue }) else { return journalFailure ? TLLFixtureExit.journalHold.rawValue : TLLFixtureExit.unexpectedRead.rawValue }
        guard outcome.allowed == .success else {
            outcome.cleanup = cleanup() ? "PASS" : "HOLD"
            return outcome.cleanup == "PASS" ? TLLFixtureExit.unexpectedRead.rawValue : TLLFixtureExit.cleanupHold.rawValue
        }
        guard operation(.readMissing, { outcome.missing = tllFixtureRead("fixture-missing", port: port, exactValue: &allowedExact); return outcome.missing == .itemMissing }, category: { outcome.missing.rawValue }) else { return journalFailure ? TLLFixtureExit.journalHold.rawValue : TLLFixtureExit.unexpectedRead.rawValue }
        guard outcome.missing == .itemMissing else {
            outcome.cleanup = cleanup() ? "PASS" : "HOLD"
            return outcome.cleanup == "PASS" ? TLLFixtureExit.unexpectedRead.rawValue : TLLFixtureExit.cleanupHold.rawValue
        }
        guard operation(.readDenied, { outcome.denied = tllFixtureRead("fixture-denied", port: port, exactValue: &allowedExact); return outcome.denied == .interactionRequired }, category: { outcome.denied.rawValue }) else { return journalFailure ? TLLFixtureExit.journalHold.rawValue : TLLFixtureExit.unexpectedRead.rawValue }
        guard outcome.denied == .interactionRequired else {
            outcome.cleanup = cleanup() ? "PASS" : "HOLD"
            return outcome.cleanup == "PASS" ? TLLFixtureExit.unexpectedRead.rawValue : TLLFixtureExit.cleanupHold.rawValue
        }
        outcome.allowedExact = allowedExact ? "PASS" : "FAIL"
        // Lock only the exact disposable keychain. Its passphrase is never sent
        // through argv, environment, logs or Keychain item comments.
        guard operation(.lock, { tllWithInteractionDisabled({ SecKeychainLock(keychain) == errSecSuccess }) == true }) else { return journalFailure ? TLLFixtureExit.journalHold.rawValue : TLLFixtureExit.unexpectedRead.rawValue }
        guard operation(.readLocked, { outcome.locked = tllFixtureRead("fixture-allowed", port: port, exactValue: &allowedExact); return outcome.locked == .interactionRequired }, category: { outcome.locked.rawValue }) else { return journalFailure ? TLLFixtureExit.journalHold.rawValue : TLLFixtureExit.unexpectedRead.rawValue }
        // An explicit in-memory password unlocks only this known disposable
        // keychain, before the verified cleanup step.
        guard operation(.unlock, { tllFixtureUnlock(keychain) }) else {
            outcome.cleanup = "HOLD"
            return journalFailure ? TLLFixtureExit.journalHold.rawValue : TLLFixtureExit.cleanupHold.rawValue
        }
        outcome.cleanup = cleanup() ? "PASS" : "HOLD"

        let expected = outcome.allowed == .success && outcome.missing == .itemMissing
            && outcome.denied == .interactionRequired && outcome.locked == .interactionRequired
            && outcome.allowedExact == "PASS" && outcome.cleanup == "PASS"
        return expected ? TLLFixtureExit.pass.rawValue
            : outcome.cleanup == "PASS" ? TLLFixtureExit.unexpectedRead.rawValue : TLLFixtureExit.cleanupHold.rawValue
    }
}
#else
// Offline-only journal mechanics checks. This test main contains no Keychain
// creation, lookup, ACL, or fixture execution path.
@main private struct TLLFixtureNativeJournalTests {
    static func main() {
        func check(_ condition: @autoclosure () -> Bool, _ label: String) {
            if !condition() { fatalError("native fixture journal test failed: \(label)") }
        }
        let data = Data("journal-record".utf8)
        var output: [UInt8] = []
        var calls = 0
        check(TLLFixtureNativeJournal.writeAll(data) { pointer, count in
            calls += 1
            if calls == 1 { errno = EINTR; return -1 }
            let amount = min(3, count)
            output.append(contentsOf: UnsafeRawBufferPointer(start: pointer, count: amount))
            return amount
        }, "partial and interrupted writes")
        check(output == Array(data) && calls > 2, "full byte sequence")
        check(!TLLFixtureNativeJournal.writeAll(data) { _, _ in 0 }, "zero write rejects")
        check(!TLLFixtureNativeJournal.writeAll(data) { _, _ in errno = EIO; return -1 }, "failed write rejects")
        check(!TLLFixtureNativeJournal.writeAll(data) { _, count in count + 1 }, "oversized write rejects")
        check(TLLFixtureNativeJournal.parseTimestamp("2026-09-24T12:34:56.789Z") != nil,
              "fractional deadline parses")
        check(TLLFixtureNativeJournal.parseTimestamp("2026-09-24T12:34:56Z") != nil,
              "whole-second deadline parses")
        let intent: [String: Any] = ["outcome": NSNull(), "category": NSNull()]
        check((try? JSONSerialization.data(withJSONObject: intent)) != nil, "null intent serializes")
        var state = TLLFixtureJournalState(runId: "123e4567-e89b-12d3-a456-426614174000", deadlineMs: 10_000)
        check(state.begin(.create, nowMs: 1_000) && !state.begin(.allowedItem, nowMs: 1_001), "intent order")
        check(!state.finish(.allowedItem, nowMs: 1_002) && state.finish(.create, nowMs: 1_003), "completion identity")
        check(!state.begin(.allowedItem, nowMs: 10_000), "deadline blocks new intent")
        var renameCalls = 0
        func fakeIO(failSyncFD: Int32? = nil, failRename: Bool = false,
                    zeroWrite: Bool = false) -> TLLFixtureJournalIO {
            TLLFixtureJournalIO(
                openFile: { path, _, _ in path == "private" ? 4 : 3 },
                writeChunk: { _, _, count in zeroWrite ? 0 : min(2, count) },
                sync: { fd in fd == failSyncFD ? -1 : 0 },
                closeFile: { _ in 0 },
                renameFile: { _, _ in renameCalls += 1; return failRename ? -1 : 0 }
            )
        }
        check(TLLFixtureNativeJournal.writeExclusive(data, to: "receipt", directory: "private",
                                                    io: fakeIO()), "short writes reach durable first receipt")
        check(!TLLFixtureNativeJournal.writeExclusive(data, to: "receipt", directory: "private",
                                                     io: fakeIO(failSyncFD: 3)), "file fsync failure stops intent")
        check(!TLLFixtureNativeJournal.writeExclusive(data, to: "receipt", directory: "private",
                                                     io: fakeIO(failSyncFD: 4)), "directory fsync failure stops intent")
        check(!TLLFixtureNativeJournal.writeAtomic(data, to: "receipt", temporary: "temp",
                                                  directory: "private", io: fakeIO(failRename: true))
              && renameCalls == 1, "rename failure stops replacement")
        check(!TLLFixtureNativeJournal.writeAtomic(data, to: "receipt", temporary: "temp",
                                                  directory: "private", io: fakeIO(zeroWrite: true))
              && renameCalls == 1, "zero write stops before rename")
        check(!TLLFixtureNativeJournal.writeAtomic(data, to: "receipt", temporary: "temp",
                                                  directory: "private", io: fakeIO(failSyncFD: 4)),
              "replacement directory fsync failure stops completion")
        let testDirectory = FileManager.default.temporaryDirectory
            .appendingPathComponent("tll-fixture-identity-\(UUID().uuidString)", isDirectory: true)
        try! FileManager.default.createDirectory(at: testDirectory, withIntermediateDirectories: false,
                                                 attributes: [.posixPermissions: 0o700])
        defer { try? FileManager.default.removeItem(at: testDirectory) }
        let original = testDirectory.appendingPathComponent("fixture")
        let moved = testDirectory.appendingPathComponent("preserved")
        try! Data("synthetic".utf8).write(to: original)
        _ = chmod(original.path, 0o600)
        let first = TLLFixtureFileIdentity.read(original.path, kind: mode_t(S_IFREG))
        check(first != nil, "owned fixture identity captured")
        try! FileManager.default.moveItem(at: original, to: moved)
        try! Data("replacement".utf8).write(to: original)
        _ = chmod(original.path, 0o600)
        check(TLLFixtureFileIdentity.read(original.path, kind: mode_t(S_IFREG)) != first,
              "same-path replacement identity refused")
        try! FileManager.default.removeItem(at: original)
        try! FileManager.default.createSymbolicLink(at: original, withDestinationURL: moved)
        check(TLLFixtureFileIdentity.read(original.path, kind: mode_t(S_IFREG)) == nil,
              "same-path symlink identity refused")
        check(tllAuthorizationGrantsRead(kSecACLAuthorizationDecrypt), "decrypt string grants read")
        check(tllAuthorizationGrantsRead(kSecACLAuthorizationAny), "any string grants read")
        check(!tllAuthorizationGrantsRead(kSecACLAuthorizationEncrypt), "encrypt string is not read")
        print("PASS 23 offline native fixture journal groups")
    }
}
#endif
