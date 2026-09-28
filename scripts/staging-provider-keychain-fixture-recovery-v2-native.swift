// Fixed-target V2 recovery for the failed Stage 3 synthetic Keychain fixture.
// This program is deliberately disabled.  It accepts exactly one recovery
// phase and has no path, credential, selector, or environment configuration.
import Darwin
import CryptoKit
import Foundation

#if !TLL_FIXTURE_RECOVERY_V2_NATIVE_TEST
import Security
#endif

#if !TLL_KEYCHAIN_FIXTURE_RECOVERY_V2
#error("Compile this recovery helper only with TLL_KEYCHAIN_FIXTURE_RECOVERY_V2")
#endif

private let TLL_FIXTURE_RECOVERY_V2_ENABLED = false
private let tllRecoveryCachesDirectory = NSHomeDirectory() + "/Library/Caches"
private let tllRecoveryDirectoryLeaf = "tll-stage3-keychain-fixture"
private let tllRecoveryDirectory = tllRecoveryCachesDirectory + "/" + tllRecoveryDirectoryLeaf
private let tllRecoveryMain = "tll-stage3-fixture.keychain-db"
private let tllRecoverySidecar = ".flA673ACC0"
private let tllRecoveryJournal = "tll-provider-keychain-fixture-recovery-v2.json"
private let tllRecoveryBaselineFile = "tll-provider-keychain-fixture-recovery-v2-baseline.json"
private let tllRecoveryBuildReceipt = "tll-provider-keychain-fixture-recovery-v2-armed.build.json"
private let tllV1ParentJournal = "tll-provider-keychain-fixture-v1.json"
private let tllV1NativeJournal = "tll-provider-keychain-fixture-native-v1.json"
private let tllV1RunID = "c02a3356-3c57-4d1f-adee-eb940cf1f87a"

private enum TLLRecoveryPhase: String, CaseIterable {
    case captureBaseline = "CAPTURE_BASELINE"
    case apiDelete = "API_DELETE"
    case sidecarReconcile = "SIDECAR_RECONCILE"
    case directoryRemove = "DIRECTORY_REMOVE"
    case finalVerify = "FINAL_VERIFY"
    var expectedSequence: Int {
        switch self {
        case .captureBaseline: return 0
        case .apiDelete: return 2
        case .sidecarReconcile: return 3
        case .directoryRemove: return 4
        case .finalVerify: return 5
        }
    }
}

private enum TLLRecoveryExit: Int32 { case pass = 0, hold = 30, guardFailed = 31 }

// All values were read from the preserved V1 incident.  They are deliberately
// constants: a recovery run must HOLD if the object has changed.
private struct TLLPinnedIdentity: Equatable {
    let device: dev_t; let inode: ino_t; let owner: uid_t; let permissions: mode_t
    let links: nlink_t; let size: off_t; let kind: mode_t
    static let directory = TLLPinnedIdentity(device: 16777234, inode: 144003366, owner: 501,
        permissions: 0o700, links: 2, size: 0, kind: mode_t(S_IFDIR))
    static let main = TLLPinnedIdentity(device: 16777234, inode: 144003379, owner: 501,
        permissions: 0o644, links: 1, size: 20460, kind: mode_t(S_IFREG))
    static let sidecar = TLLPinnedIdentity(device: 16777234, inode: 144003377, owner: 501,
        permissions: 0o444, links: 1, size: 0, kind: mode_t(S_IFREG))
}

private let tllPinnedMainHash = "eaf94db34cc0094496532ee781babd1a551ce248abe6815792f1f1a0b79b3c42"
private let tllPinnedSidecarHash = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"

private struct TLLObservedIdentity: Equatable {
    let device: dev_t; let inode: ino_t; let owner: uid_t; let permissions: mode_t
    let links: nlink_t; let size: off_t; let kind: mode_t
    init(_ info: stat) {
        device = info.st_dev; inode = info.st_ino; owner = info.st_uid
        permissions = info.st_mode & 0o777; links = info.st_nlink; size = info.st_size
        kind = info.st_mode & mode_t(S_IFMT)
    }
    init(device: dev_t, inode: ino_t, owner: uid_t, permissions: mode_t, links: nlink_t, size: off_t, kind: mode_t) {
        self.device = device; self.inode = inode; self.owner = owner; self.permissions = permissions
        self.links = links; self.size = size; self.kind = kind
    }
    func matches(_ expected: TLLPinnedIdentity, includingLinkAndSize: Bool = true) -> Bool {
        device == expected.device && inode == expected.inode && owner == expected.owner
            && permissions == expected.permissions && kind == expected.kind
            && (!includingLinkAndSize || (links == expected.links && size == expected.size))
    }
}

private struct TLLRecoveryFilesystem {
    let isLive: Bool
    let lstat: (String, UnsafeMutablePointer<stat>) -> Int32
    let open: (String, Int32) -> Int32
    let fstat: (Int32, UnsafeMutablePointer<stat>) -> Int32
    let fstatat: (Int32, String, UnsafeMutablePointer<stat>, Int32) -> Int32
    let openat: (Int32, String, Int32) -> Int32
    let unlinkat: (Int32, String, Int32) -> Int32
    let close: (Int32) -> Int32
    static let real = TLLRecoveryFilesystem(isLive: true,
        lstat: { path, info in path.withCString { Darwin.lstat($0, info) } },
        open: { path, flags in path.withCString { Darwin.open($0, flags) } },
        fstat: { Darwin.fstat($0, $1) },
        fstatat: { fd, leaf, info, flags in leaf.withCString { Darwin.fstatat(fd, $0, info, flags) } },
        openat: { fd, leaf, flags in leaf.withCString { Darwin.openat(fd, $0, flags) } },
        unlinkat: { fd, leaf, flags in leaf.withCString { Darwin.unlinkat(fd, $0, flags) } },
        close: { Darwin.close($0) })
}

private func tllHash(_ path: String) -> String? {
    tllHashBoundRegularPath(path)
}

// Hash only an already-open, no-follow leaf descriptor.  Do not reopen the
// pathname: the descriptor identity is the object we subsequently authorise.
private func tllHashOpenFile(_ fd: Int32, expected: TLLObservedIdentity) -> String? {
    var before = stat()
    guard fstat(fd, &before) == 0, TLLObservedIdentity(before) == expected,
          before.st_size >= 0, before.st_size <= 33_554_432 else { return nil }
    let size = Int(before.st_size)
    var bytes = [UInt8](repeating: 0, count: size)
    var offset = 0
    while offset < size {
        let count = bytes.withUnsafeMutableBytes { buffer in
            Darwin.pread(fd, buffer.baseAddress!.advanced(by: offset), size - offset, off_t(offset))
        }
        if count < 0 && errno == EINTR { continue }
        guard count > 0 && count <= size - offset else { return nil }
        offset += count
    }
    var after = stat()
    guard fstat(fd, &after) == 0, TLLObservedIdentity(after) == expected else { return nil }
    return SHA256.hash(data: Data(bytes)).map { String(format: "%02x", $0) }.joined()
}

private func tllHashBoundRegularPath(_ path: String) -> String? {
    var named = stat()
    guard lstat(path, &named) == 0, (named.st_mode & mode_t(S_IFMT)) == mode_t(S_IFREG),
          named.st_nlink == 1 else { return nil }
    let fd = path.withCString { Darwin.open($0, O_RDONLY | O_NOFOLLOW | O_CLOEXEC) }
    guard fd >= 0 else { return nil }
    defer { _ = Darwin.close(fd) }
    return tllHashOpenFile(fd, expected: TLLObservedIdentity(named))
}

private func tllReadIdentity(_ path: String, _ fs: TLLRecoveryFilesystem = .real) -> TLLObservedIdentity? {
    var value = stat(); guard fs.lstat(path, &value) == 0 else { return nil }; return TLLObservedIdentity(value)
}

private func tllReadPrivateData(_ path: String, maximumSize: off_t) -> Data? {
    var named = stat()
    guard lstat(path, &named) == 0, (named.st_mode & mode_t(S_IFMT)) == mode_t(S_IFREG),
          named.st_uid == getuid(), named.st_nlink == 1, (named.st_mode & 0o777) == 0o600,
          named.st_size > 0, named.st_size <= maximumSize else { return nil }
    let descriptor = path.withCString { Darwin.open($0, O_RDONLY | O_NOFOLLOW | O_CLOEXEC) }
    guard descriptor >= 0 else { return nil }
    defer { _ = Darwin.close(descriptor) }
    var opened = stat()
    guard fstat(descriptor, &opened) == 0, TLLObservedIdentity(opened) == TLLObservedIdentity(named) else { return nil }
    var bytes = [UInt8](repeating: 0, count: Int(opened.st_size))
    defer { bytes.withUnsafeMutableBytes { buffer in
        if let base = buffer.baseAddress { memset(base, 0, buffer.count) }
    } }
    var offset = 0
    let byteCount = bytes.count
    while offset < byteCount {
        let count = bytes.withUnsafeMutableBytes { buffer in
            Darwin.pread(descriptor, buffer.baseAddress!.advanced(by: offset), byteCount - offset, off_t(offset))
        }
        if count < 0 && errno == EINTR { continue }
        guard count > 0 && count <= bytes.count - offset else { return nil }
        offset += count
    }
    var after = stat(); var stillNamed = stat()
    guard fstat(descriptor, &after) == 0, lstat(path, &stillNamed) == 0,
          TLLObservedIdentity(after) == TLLObservedIdentity(named),
          TLLObservedIdentity(stillNamed) == TLLObservedIdentity(named) else { return nil }
    return Data(bytes)
}

// The only leaf resolver.  It opens the parent directory no-follow, checks its
// pinned identity, then resolves exactly one fixed leaf through that descriptor.
private func tllWithPinnedDirectory<T>(_ fs: TLLRecoveryFilesystem = .real,
                                       _ body: (Int32) -> T?) -> T? {
    let fd = fs.open(tllRecoveryDirectory, O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC)
    guard fd >= 0 else { return nil }
    defer { _ = fs.close(fd) }
    var opened = stat()
    guard fs.fstat(fd, &opened) == 0, TLLObservedIdentity(opened).matches(.directory, includingLinkAndSize: false),
          tllReadIdentity(tllRecoveryDirectory, fs)?.matches(.directory, includingLinkAndSize: false) == true else { return nil }
    return body(fd)
}

private func tllPinnedDirectoryFD(_ fd: Int32, _ fs: TLLRecoveryFilesystem = .real) -> Bool {
    var opened = stat(); var named = stat()
    return fs.fstat(fd, &opened) == 0 && fs.lstat(tllRecoveryDirectory, &named) == 0
        && TLLObservedIdentity(opened).matches(.directory, includingLinkAndSize: false)
        && TLLObservedIdentity(named).matches(.directory, includingLinkAndSize: false)
        && opened.st_dev == named.st_dev && opened.st_ino == named.st_ino
}

private func tllGuardedEffect(expected: TLLKeychainBaseline,
                              observe: () -> TLLKeychainBaseline?,
                              target: () -> Bool, effect: () -> Bool) -> Bool {
    observe() == expected && target() && effect()
}

private func tllWithRecoveryParent<T>(_ fs: TLLRecoveryFilesystem = .real,
                                      _ body: (Int32) -> T?) -> T? {
    let fd = fs.open(tllRecoveryCachesDirectory, O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC)
    guard fd >= 0 else { return nil }
    defer { _ = fs.close(fd) }
    var parent = stat(); var child = stat()
    guard fs.fstat(fd, &parent) == 0, (parent.st_mode & mode_t(S_IFMT)) == mode_t(S_IFDIR),
          parent.st_uid == getuid(), (parent.st_mode & 0o022) == 0,
          fs.fstatat(fd, tllRecoveryDirectoryLeaf, &child, AT_SYMLINK_NOFOLLOW) == 0,
          TLLObservedIdentity(child).matches(.directory, includingLinkAndSize: false) else { return nil }
    return body(fd)
}

private func tllPinnedLeaf(_ fd: Int32, leaf: String, expected: TLLPinnedIdentity,
                           hash: String, fs: TLLRecoveryFilesystem = .real) -> Bool {
    guard leaf == tllRecoveryMain || leaf == tllRecoverySidecar else { return false }
    var listed = stat()
    guard fs.fstatat(fd, leaf, &listed, AT_SYMLINK_NOFOLLOW) == 0,
          TLLObservedIdentity(listed).matches(expected) else { return false }
    let leafFD = fs.openat(fd, leaf, O_RDONLY | O_NOFOLLOW | O_CLOEXEC)
    guard leafFD >= 0 else { return false }
    defer { _ = fs.close(leafFD) }
    var opened = stat()
    guard fs.fstat(leafFD, &opened) == 0, TLLObservedIdentity(opened) == TLLObservedIdentity(listed) else { return false }
    // Hash after the descriptor identity check.  The live operation hashes the
    // opened descriptor itself; tests use fake ports and stop at identity.
    guard !fs.isLive || tllHashOpenFile(leafFD, expected: TLLObservedIdentity(opened)) == hash else { return false }
    var relisted = stat()
    return fs.fstatat(fd, leaf, &relisted, AT_SYMLINK_NOFOLLOW) == 0
        && TLLObservedIdentity(relisted) == TLLObservedIdentity(opened)
        && tllPinnedDirectoryFD(fd, fs)
}

private func tllExactDirectoryEntries() -> [String]? {
    guard let names = try? FileManager.default.contentsOfDirectory(atPath: tllRecoveryDirectory) else { return nil }
    return names.sorted()
}

// This is a pure preflight rule used by offline tests.  A caller supplies only
// metadata, so the test main never has to create or inspect a Keychain file.
private func tllValidFixtureState(directory: TLLObservedIdentity?, main: TLLObservedIdentity?,
                                  sidecar: TLLObservedIdentity?, entries: [String]) -> Bool {
    directory?.matches(.directory, includingLinkAndSize: false) == true
        && main?.matches(.main) == true && sidecar?.matches(.sidecar) == true
        && entries.sorted() == [tllRecoverySidecar, tllRecoveryMain].sorted()
}

private func tllValidSidecarAlreadyAbsent(directory: TLLObservedIdentity?, mainPresent: Bool,
                                          entries: [String]) -> Bool {
    directory?.matches(.directory, includingLinkAndSize: false) == true
        && !mainPresent && entries.isEmpty
}

private enum TLLSidecarRecoveryState { case absent, valid, invalid }
private struct TLLSidecarRecoveryPort {
    let mainAbsent: () -> Bool
    let directoryPinned: () -> Bool
    let entries: () -> [String]?
    let sidecar: () -> TLLSidecarRecoveryState
    let unlinkSidecar: () -> Bool
}

// The effectful wrapper below supplies fixed filesystem calls.  This small
// coordinator makes the stop/no-fallback rules executable in offline tests.
private func tllReconcileSidecar(_ port: TLLSidecarRecoveryPort) -> Bool {
    guard port.mainAbsent(), port.directoryPinned() else { return false }
    switch port.sidecar() {
    case .absent:
        return port.entries() == [] && port.directoryPinned()
    case .valid:
        guard port.entries() == [tllRecoverySidecar], port.directoryPinned(), port.unlinkSidecar() else { return false }
        return port.entries() == [] && port.directoryPinned()
    case .invalid:
        return false
    }
}

private struct TLLDirectoryRemovalPort {
    let directoryPinned: () -> Bool
    let entries: () -> [String]?
    let removeDirectory: () -> Bool
}
private func tllRemoveEmptyDirectoryWithPort(_ port: TLLDirectoryRemovalPort) -> Bool {
    guard port.directoryPinned(), port.entries() == [], port.directoryPinned(), port.removeDirectory() else { return false }
    return true
}

private func tllSyntheticObjectsMatch(_ fs: TLLRecoveryFilesystem = .real) -> Bool {
    guard tllWithPinnedDirectory(fs, { fd in
        tllPinnedLeaf(fd, leaf: tllRecoveryMain, expected: .main, hash: tllPinnedMainHash, fs: fs)
            && tllPinnedLeaf(fd, leaf: tllRecoverySidecar, expected: .sidecar, hash: tllPinnedSidecarHash, fs: fs)
    }) == true else { return false }
    return fs.isLive
        ? tllExactDirectoryEntries() == [tllRecoverySidecar, tllRecoveryMain].sorted() : true
}

private struct TLLRecoveryV2Journal {
    let runId: String; let sourceSha256: String; let binarySha256: String
    let baselineSha256: String?; let phase: TLLRecoveryPhase
    let phaseDeadline: Date; let runDeadline: Date
    static let exactKeys: Set<String> = ["schema", "runId", "sourceSha256", "binarySha256", "baselineSha256", "sequence",
        "phase", "startedAt", "updatedAt", "phaseDeadlineAt", "runDeadlineAt", "outcome"]
    static func load(phase expected: TLLRecoveryPhase, now: Date = Date()) -> TLLRecoveryV2Journal? {
        let root = URL(fileURLWithPath: FileManager.default.currentDirectoryPath).standardizedFileURL
        guard root.lastPathComponent == "implementation-integration" else { return nil }
        let state = root.deletingLastPathComponent().appendingPathComponent("implementation-state/staging")
        let path = state.appendingPathComponent(tllRecoveryJournal)
        guard let bytes = tllReadPrivateData(path.path, maximumSize: 4_096),
              let object = try? JSONSerialization.jsonObject(with: bytes) as? [String: Any],
              Set(object.keys) == exactKeys, object["schema"] as? String == "tll-stage3-fixture-recovery/v2",
              object["sequence"] as? Int == expected.expectedSequence, object["phase"] as? String == expected.rawValue,
              object["outcome"] is NSNull,
              let runId = object["runId"] as? String,
              runId.range(of: "^[0-9a-f-]{36}$", options: .regularExpression) != nil,
              let source = object["sourceSha256"] as? String, let binary = object["binarySha256"] as? String,
              source.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil,
              binary.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil,
              let baselineObject = object["baselineSha256"],
              baselineObject is NSNull || baselineObject is String,
              let phaseText = object["phaseDeadlineAt"] as? String, let runText = object["runDeadlineAt"] as? String,
              let phaseDeadline = parse(phaseText), let runDeadline = parse(runText),
              min(phaseDeadline, runDeadline) > now,
              tllHash(root.appendingPathComponent("scripts/staging-provider-keychain-fixture-recovery-v2-native.swift").path) == source,
              buildReceipt(state, source: source, binary: binary)
        else { return nil }
        let baseline = baselineObject as? String
        guard (expected == .captureBaseline && baseline == nil)
            || (expected != .captureBaseline && baseline?.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil)
        else { return nil }
        // The two V1 journals must be preserved terminal evidence.  The helper
        // reads only their state labels and never opens either as a Keychain.
        guard parentTerminal(state.appendingPathComponent(tllV1ParentJournal)),
              nativeTerminal(state.appendingPathComponent(tllV1NativeJournal)) else { return nil }
        return TLLRecoveryV2Journal(runId: runId, sourceSha256: source,
                                  binarySha256: binary, baselineSha256: baseline, phase: expected,
                                  phaseDeadline: phaseDeadline, runDeadline: runDeadline)
    }
    private static func parse(_ value: String) -> Date? {
        let f = ISO8601DateFormatter(); f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f.date(from: value) ?? ISO8601DateFormatter().date(from: value)
    }
    private static func parentTerminal(_ path: URL) -> Bool {
        guard let bytes = tllReadPrivateData(path.path, maximumSize: 4_096),
              let object = try? JSONSerialization.jsonObject(with: bytes) as? [String: Any] else { return false }
        return object["schema"] as? String == "tll-stage3-disposable-keychain-fixture/v1"
            && object["runId"] as? String == tllV1RunID && object["sequence"] as? Int == 3
            && object["phase"] as? String == "LOCAL_RECONCILIATION" && object["outcome"] as? String == "HOLD"
    }
    private static func nativeTerminal(_ path: URL) -> Bool {
        guard let bytes = tllReadPrivateData(path.path, maximumSize: 4_096),
              let object = try? JSONSerialization.jsonObject(with: bytes) as? [String: Any] else { return false }
        return object["schema"] as? String == "tll-stage3-disposable-keychain-native/v1"
            && object["runId"] as? String == tllV1RunID && object["sequence"] as? Int == 1
            && object["operation"] as? String == "CREATE" && object["status"] as? String == "COMPLETE"
            && object["outcome"] as? String == "HOLD"
    }
    private static func buildReceipt(_ state: URL, source: String, binary: String) -> Bool {
        let path = state.appendingPathComponent(tllRecoveryBuildReceipt)
        let executable = state.appendingPathComponent("tll-provider-keychain-fixture-recovery-v2-armed")
        var executableInfo = stat()
        guard lstat(executable.path, &executableInfo) == 0,
              (executableInfo.st_mode & mode_t(S_IFMT)) == mode_t(S_IFREG), executableInfo.st_uid == getuid(),
              executableInfo.st_nlink == 1, (executableInfo.st_mode & 0o777) == 0o700,
              tllHashBoundRegularPath(executable.path) == binary,
              let bytes = tllReadPrivateData(path.path, maximumSize: 4_096),
              let object = try? JSONSerialization.jsonObject(with: bytes) as? [String: Any],
              Set(object.keys) == Set(["schema", "sourceSha256", "binarySha256", "architecture", "signingIdentifier", "signingKind"])
        else { return false }
        return object["schema"] as? String == "tll-fixture-recovery-v2-armed-build/v2"
            && object["sourceSha256"] as? String == source && object["binarySha256"] as? String == binary
            && object["architecture"] as? String == "arm64"
            && object["signingIdentifier"] as? String == "tll-provider-keychain-fixture-recovery-v2-armed"
            && object["signingKind"] as? String == "adhoc"
    }
}

private let tllLoginPath = NSHomeDirectory() + "/Library/Keychains/login.keychain-db"
private struct TLLKeychainEntry: Equatable {
    let path: String
    let device: dev_t
    let inode: ino_t
}
private struct TLLKeychainBaseline: Equatable {
    let defaultPath: String
    let effectiveSearch: [TLLKeychainEntry]
    let userSearch: [TLLKeychainEntry]
}
private struct TLLBaselineEntryPayload: Codable {
    let path: String
    let device: String
    let inode: String
    init(_ value: TLLKeychainEntry) {
        path = value.path; device = String(value.device); inode = String(value.inode)
    }
    func entry() -> TLLKeychainEntry? {
        guard path.hasPrefix("/"), path.utf8.count <= 4096,
              let deviceValue = dev_t(device), String(deviceValue) == device,
              let inodeValue = ino_t(inode), String(inodeValue) == inode else { return nil }
        return TLLKeychainEntry(path: path, device: deviceValue, inode: inodeValue)
    }
}
private struct TLLBaselinePayload: Codable {
    let schema: String
    let runId: String
    let sourceSha256: String
    let binarySha256: String
    let domain: String
    let defaultPath: String
    let effectiveSearch: [TLLBaselineEntryPayload]
    let userSearch: [TLLBaselineEntryPayload]
    init(_ value: TLLKeychainBaseline, journal: TLLRecoveryV2Journal) {
        schema = "tll-stage3-fixture-recovery-baseline/v2"
        runId = journal.runId; sourceSha256 = journal.sourceSha256
        binarySha256 = journal.binarySha256; domain = "USER"
        defaultPath = value.defaultPath
        effectiveSearch = value.effectiveSearch.map(TLLBaselineEntryPayload.init)
        userSearch = value.userSearch.map(TLLBaselineEntryPayload.init)
    }
    func baseline(journal: TLLRecoveryV2Journal) -> TLLKeychainBaseline? {
        guard schema == "tll-stage3-fixture-recovery-baseline/v2", runId == journal.runId,
              sourceSha256 == journal.sourceSha256, binarySha256 == journal.binarySha256,
              domain == "USER", effectiveSearch.count > 0, effectiveSearch.count <= 32,
              userSearch.count == 1 else { return nil }
        let effective = effectiveSearch.compactMap { $0.entry() }
        let user = userSearch.compactMap { $0.entry() }
        guard effective.count == effectiveSearch.count, user.count == 1 else { return nil }
        return TLLKeychainBaseline(defaultPath: defaultPath, effectiveSearch: effective, userSearch: user)
    }
}

// The effective list may contain common or dynamic entries.  Accept those
// only as an immutable before/after snapshot, never as permission to edit them.
private func tllValidKeychainBaseline(_ value: TLLKeychainBaseline,
                                      login: TLLKeychainEntry) -> Bool {
    let effective = value.effectiveSearch
    let identities = effective.map { "\($0.device):\($0.inode)" }
    return value.defaultPath == tllLoginPath && login.path == tllLoginPath
        && value.userSearch == [login] && !effective.isEmpty && effective.count <= 32
        && effective.filter { $0 == login }.count == 1
        && effective.filter { $0.device == login.device && $0.inode == login.inode }.count == 1
        && !effective.contains { ($0.device == TLLPinnedIdentity.main.device
            && $0.inode == TLLPinnedIdentity.main.inode)
            || ($0.device == TLLPinnedIdentity.sidecar.device
            && $0.inode == TLLPinnedIdentity.sidecar.inode) }
        && Set(effective.map(\.path)).count == effective.count
        && Set(identities).count == effective.count
}

#if !TLL_FIXTURE_RECOVERY_V2_NATIVE_TEST
private func tllBaselineFileURL() -> URL {
    let root = URL(fileURLWithPath: FileManager.default.currentDirectoryPath).standardizedFileURL
    return root.deletingLastPathComponent().appendingPathComponent("implementation-state/staging")
        .appendingPathComponent(tllRecoveryBaselineFile)
}
private func tllWriteBaseline(_ baseline: TLLKeychainBaseline,
                              journal: TLLRecoveryV2Journal) -> Bool {
    guard journal.phase == .captureBaseline, journal.baselineSha256 == nil,
          let login = tllKeychainEntry(tllLoginPath),
          tllValidKeychainBaseline(baseline, login: login) else { return false }
    let encoder = JSONEncoder(); encoder.outputFormatting = [.sortedKeys]
    guard var bytes = try? encoder.encode(TLLBaselinePayload(baseline, journal: journal)) else { return false }
    bytes.append(0x0a)
    let path = tllBaselineFileURL().path
    let descriptor = path.withCString { Darwin.open($0, O_WRONLY | O_CREAT | O_EXCL | O_NOFOLLOW | O_CLOEXEC, 0o600) }
    guard descriptor >= 0 else { return false }
    var written = 0
    let total = bytes.count
    while written < total {
        let count = bytes.withUnsafeBytes { buffer in
            Darwin.write(descriptor, buffer.baseAddress!.advanced(by: written), total - written)
        }
        if count < 0 && errno == EINTR { continue }
        if count <= 0 { _ = Darwin.close(descriptor); return false }
        written += count
    }
    let synced = Darwin.fsync(descriptor) == 0
    let closed = Darwin.close(descriptor) == 0
    guard synced && closed, tllReadPrivateData(path, maximumSize: 524_288) == bytes else { return false }
    let directory = tllBaselineFileURL().deletingLastPathComponent().path
    let directoryFD = directory.withCString { Darwin.open($0, O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC) }
    guard directoryFD >= 0 else { return false }
    defer { _ = Darwin.close(directoryFD) }
    return Darwin.fsync(directoryFD) == 0
}
private func tllLoadPinnedBaseline(_ journal: TLLRecoveryV2Journal) -> TLLKeychainBaseline? {
    guard let digest = journal.baselineSha256,
          let bytes = tllReadPrivateData(tllBaselineFileURL().path, maximumSize: 524_288),
          tllHashData(bytes) == digest,
          let object = try? JSONSerialization.jsonObject(with: bytes) as? [String: Any],
          Set(object.keys) == Set(["schema", "runId", "sourceSha256", "binarySha256", "domain",
                                   "defaultPath", "effectiveSearch", "userSearch"]),
          let payload = try? JSONDecoder().decode(TLLBaselinePayload.self, from: bytes),
          let baseline = payload.baseline(journal: journal),
          let login = tllKeychainEntry(tllLoginPath),
          tllValidKeychainBaseline(baseline, login: login) else { return nil }
    return baseline
}
private func tllHashData(_ bytes: Data) -> String {
    SHA256.hash(data: bytes).map { String(format: "%02x", $0) }.joined()
}
private func tllKeychainPath(_ keychain: SecKeychain) -> String? {
    var buffer = [CChar](repeating: 0, count: 4096); var length = UInt32(buffer.count)
    guard SecKeychainGetPath(keychain, &length, &buffer) == errSecSuccess, length < UInt32(buffer.count) else { return nil }
    return String(cString: buffer)
}
private func tllKeychainEntry(_ path: String) -> TLLKeychainEntry? {
    var info = stat()
    guard path.withCString({ Darwin.fstatat(AT_FDCWD, $0, &info, 0) }) == 0,
          (info.st_mode & mode_t(S_IFMT)) == mode_t(S_IFREG) else { return nil }
    return TLLKeychainEntry(path: path, device: info.st_dev, inode: info.st_ino)
}
private func tllKeychainEntries(_ list: CFArray) -> [TLLKeychainEntry]? {
    guard CFArrayGetCount(list) <= 32 else { return nil }
    var entries: [TLLKeychainEntry] = []
    for index in 0..<CFArrayGetCount(list) {
        let raw = CFArrayGetValueAtIndex(list, index)
        let object = unsafeBitCast(raw, to: CFTypeRef.self)
        guard CFGetTypeID(object) == SecKeychainGetTypeID(),
              let path = tllKeychainPath(unsafeBitCast(raw, to: SecKeychain.self)),
              let entry = tllKeychainEntry(path) else { return nil }
        entries.append(entry)
    }
    return entries
}
private func tllWithInteractionDisabled<T>(_ body: () -> T?) -> T? {
    var prior: DarwinBoolean = false
    guard SecKeychainGetUserInteractionAllowed(&prior) == errSecSuccess else { return nil }
    guard SecKeychainSetUserInteractionAllowed(false) == errSecSuccess else {
        // Restore even after a reported disable failure: a partial framework
        // effect must not be allowed to leak into a later operation.
        _ = SecKeychainSetUserInteractionAllowed(prior.boolValue)
        return nil
    }
    let value = body()
    // A failed first restoration is a HOLD even when the best-effort second
    // attempt succeeds: the interaction state was uncertain during the window.
    if SecKeychainSetUserInteractionAllowed(prior.boolValue) != errSecSuccess {
        _ = SecKeychainSetUserInteractionAllowed(prior.boolValue)
        return nil
    }
    return value
}
private func tllBaseline() -> TLLKeychainBaseline? { tllWithInteractionDisabled {
    var domain: SecPreferencesDomain = .user
    var current: SecKeychain?; var effectiveList: CFArray?; var userList: CFArray?
    guard SecKeychainGetPreferenceDomain(&domain) == errSecSuccess, domain == .user,
          SecKeychainCopyDefault(&current) == errSecSuccess, let current,
          let defaultPath = tllKeychainPath(current),
          SecKeychainCopySearchList(&effectiveList) == errSecSuccess, let effectiveList,
          SecKeychainCopyDomainSearchList(.user, &userList) == errSecSuccess, let userList,
          let effective = tllKeychainEntries(effectiveList),
          let user = tllKeychainEntries(userList),
          let login = tllKeychainEntry(tllLoginPath) else { return nil }
    let baseline = TLLKeychainBaseline(defaultPath: defaultPath,
        effectiveSearch: effective, userSearch: user)
    return tllValidKeychainBaseline(baseline, login: login) ? baseline : nil
} }
private func tllApiDelete(expected: TLLKeychainBaseline) -> Bool {
    guard tllBaseline() == expected, tllSyntheticObjectsMatch() else { return false }
    return tllWithInteractionDisabled {
        var keychain: SecKeychain?
        guard SecKeychainOpen(tllRecoveryDirectory + "/" + tllRecoveryMain, &keychain) == errSecSuccess,
              let keychain, tllKeychainPath(keychain) == tllRecoveryDirectory + "/" + tllRecoveryMain,
              tllGuardedEffect(expected: expected, observe: tllBaseline,
                  target: { tllSyntheticObjectsMatch() },
                  effect: { SecKeychainDelete(keychain) == errSecSuccess }) else { return false }
        // No unlink fallback: a surviving main Keychain is a HOLD.
        return !FileManager.default.fileExists(atPath: tllRecoveryDirectory + "/" + tllRecoveryMain)
            && tllBaseline() == expected
    } == true
}
private func tllRemoveSidecar(expected: TLLKeychainBaseline) -> Bool {
    guard tllBaseline() == expected else { return false }
    let mainPath = tllRecoveryDirectory + "/" + tllRecoveryMain
    let result = tllWithPinnedDirectory { fd -> Bool in
        let filesystem = TLLRecoveryFilesystem.real
        var listed = stat()
        let state: TLLSidecarRecoveryState
        if filesystem.fstatat(fd, tllRecoverySidecar, &listed, AT_SYMLINK_NOFOLLOW) != 0 {
            state = errno == ENOENT ? .absent : .invalid
        } else {
            state = tllPinnedLeaf(fd, leaf: tllRecoverySidecar, expected: .sidecar,
                                  hash: tllPinnedSidecarHash, fs: filesystem) ? .valid : .invalid
        }
        return tllReconcileSidecar(TLLSidecarRecoveryPort(
            mainAbsent: { !FileManager.default.fileExists(atPath: mainPath) },
            directoryPinned: { tllPinnedDirectoryFD(fd, filesystem) && tllBaseline() == expected },
            entries: { tllExactDirectoryEntries() }, sidecar: { state },
            unlinkSidecar: {
                // POSIX unlinkat addresses a name, not an open file descriptor.
                // Revalidate the fixed sidecar and directory immediately before
                // the call; a mismatch or an unexpected postcheck is a HOLD.
                tllGuardedEffect(expected: expected, observe: tllBaseline,
                    target: {
                        guard tllPinnedDirectoryFD(fd, filesystem) else { return false }
                        var current = stat()
                        return filesystem.fstatat(fd, tllRecoverySidecar, &current, AT_SYMLINK_NOFOLLOW) == 0
                            && TLLObservedIdentity(current).matches(.sidecar)
                    }, effect: { filesystem.unlinkat(fd, tllRecoverySidecar, 0) == 0 })
            }))
    } == true
    return result && tllBaseline() == expected
}
private func tllRemoveEmptyDirectory(expected: TLLKeychainBaseline) -> Bool {
    guard tllBaseline() == expected else { return false }
    let result = tllRemoveEmptyDirectoryWithPort(TLLDirectoryRemovalPort(
        directoryPinned: { tllWithPinnedDirectory(.real, { _ in true }) == true && tllBaseline() == expected },
        entries: { tllExactDirectoryEntries() },
        removeDirectory: {
            // Deletion is anchored to a no-follow descriptor for Library/Caches,
            // which rechecks the exact child identity immediately before unlinkat.
            tllWithRecoveryParent(.real, { parent in
                tllGuardedEffect(expected: expected, observe: tllBaseline,
                    target: {
                        var opened = stat(); var named = stat()
                        guard fstat(parent, &opened) == 0
                            && lstat(tllRecoveryCachesDirectory, &named) == 0
                            && TLLObservedIdentity(opened) == TLLObservedIdentity(named) else { return false }
                        var current = stat()
                        return fstatat(parent, tllRecoveryDirectoryLeaf, &current, AT_SYMLINK_NOFOLLOW) == 0
                            && TLLObservedIdentity(current).matches(.directory, includingLinkAndSize: false)
                    }, effect: {
                        TLLRecoveryFilesystem.real.unlinkat(parent, tllRecoveryDirectoryLeaf, AT_REMOVEDIR) == 0
                    })
            }) == true
        }))
    guard result else { return false }
    return !FileManager.default.fileExists(atPath: tllRecoveryDirectory) && tllBaseline() == expected
}
@main private struct TLLRecoveryV2Main {
    static func main() {
        guard TLL_FIXTURE_RECOVERY_V2_ENABLED,
              CommandLine.arguments.count == 2,
              let phase = TLLRecoveryPhase(rawValue: CommandLine.arguments[1]),
              let journal = TLLRecoveryV2Journal.load(phase: phase) else { Darwin.exit(TLLRecoveryExit.guardFailed.rawValue) }
        let result: Bool
        if phase == .captureBaseline {
            result = tllSyntheticObjectsMatch() && (tllBaseline().map { tllWriteBaseline($0, journal: journal) } == true)
        } else {
            guard let expected = tllLoadPinnedBaseline(journal),
                  tllBaseline() == expected else { Darwin.exit(TLLRecoveryExit.hold.rawValue) }
            switch phase {
            case .captureBaseline: result = false
            case .apiDelete: result = tllApiDelete(expected: expected)
            case .sidecarReconcile: result = tllRemoveSidecar(expected: expected)
            case .directoryRemove: result = tllRemoveEmptyDirectory(expected: expected)
            case .finalVerify:
                result = !FileManager.default.fileExists(atPath: tllRecoveryDirectory)
                    && tllBaseline() == expected
            }
        }
        if result { print(phase.rawValue + "_PASS") }
        Darwin.exit(result ? TLLRecoveryExit.pass.rawValue : TLLRecoveryExit.hold.rawValue)
    }
}
#else
@main private struct TLLRecoveryV2OfflineTests {
    static func main() {
        var groups = 0
        func expect(_ value: Bool) { if !value { Darwin.exit(1) } }
        let exact = TLLObservedIdentity(device: 16777234, inode: 144003379, owner: 501, permissions: 0o644, links: 1, size: 20460, kind: mode_t(S_IFREG))
        expect(exact.matches(.main)); groups += 1
        expect(!TLLObservedIdentity(device: 16777234, inode: 1, owner: 501, permissions: 0o644, links: 1, size: 20460, kind: mode_t(S_IFREG)).matches(.main)); groups += 1
        expect(!TLLObservedIdentity(device: 16777234, inode: 144003379, owner: 501, permissions: 0o644, links: 2, size: 20460, kind: mode_t(S_IFREG)).matches(.main)); groups += 1
        expect(!TLLObservedIdentity(device: 16777234, inode: 144003377, owner: 501, permissions: 0o444, links: 1, size: 1, kind: mode_t(S_IFREG)).matches(.sidecar)); groups += 1
        let directory = TLLObservedIdentity(device: 16777234, inode: 144003366, owner: 501, permissions: 0o700, links: 99, size: 999, kind: mode_t(S_IFDIR))
        let sidecar = TLLObservedIdentity(device: 16777234, inode: 144003377, owner: 501, permissions: 0o444, links: 1, size: 0, kind: mode_t(S_IFREG))
        expect(tllValidFixtureState(directory: directory, main: exact, sidecar: sidecar, entries: [tllRecoveryMain, tllRecoverySidecar])); groups += 1
        // A missing sidecar, extra leaf, replacement inode and symlink are all
        // HOLD conditions before an API operation can be attempted.
        expect(!tllValidFixtureState(directory: directory, main: exact, sidecar: nil, entries: [tllRecoveryMain])); groups += 1
        expect(!tllValidFixtureState(directory: directory, main: exact, sidecar: sidecar, entries: [tllRecoveryMain, tllRecoverySidecar, "other"])); groups += 1
        expect(!tllValidFixtureState(directory: directory, main: TLLObservedIdentity(device: 16777234, inode: 9, owner: 501, permissions: 0o644, links: 1, size: 20460, kind: mode_t(S_IFREG)), sidecar: sidecar, entries: [tllRecoveryMain, tllRecoverySidecar])); groups += 1
        expect(!tllValidFixtureState(directory: directory, main: TLLObservedIdentity(device: 16777234, inode: 144003379, owner: 501, permissions: 0o777, links: 1, size: 20460, kind: mode_t(S_IFLNK)), sidecar: sidecar, entries: [tllRecoveryMain, tllRecoverySidecar])); groups += 1
        expect(tllValidSidecarAlreadyAbsent(directory: directory, mainPresent: false, entries: [])); groups += 1
        expect(!tllValidSidecarAlreadyAbsent(directory: directory, mainPresent: true, entries: [])); groups += 1
        expect(!tllValidSidecarAlreadyAbsent(directory: directory, mainPresent: false, entries: ["other"])); groups += 1
        var sidecarEntries = [tllRecoverySidecar], sidecarDeletes = 0
        let validSidecarPort = TLLSidecarRecoveryPort(mainAbsent: { true }, directoryPinned: { true },
            entries: { sidecarEntries }, sidecar: { .valid }, unlinkSidecar: {
                sidecarDeletes += 1; sidecarEntries = []; return true })
        expect(tllReconcileSidecar(validSidecarPort) && sidecarDeletes == 1); groups += 1
        var absentDeletes = 0
        expect(tllReconcileSidecar(TLLSidecarRecoveryPort(mainAbsent: { true }, directoryPinned: { true },
            entries: { [] }, sidecar: { .absent }, unlinkSidecar: { absentDeletes += 1; return true })) && absentDeletes == 0); groups += 1
        var wrongDeletes = 0
        expect(!tllReconcileSidecar(TLLSidecarRecoveryPort(mainAbsent: { true }, directoryPinned: { true },
            entries: { [tllRecoverySidecar] }, sidecar: { .invalid }, unlinkSidecar: { wrongDeletes += 1; return true })) && wrongDeletes == 0); groups += 1
        var replacementDeletes = 0
        expect(!tllReconcileSidecar(TLLSidecarRecoveryPort(mainAbsent: { true }, directoryPinned: { false },
            entries: { [tllRecoverySidecar] }, sidecar: { .valid }, unlinkSidecar: { replacementDeletes += 1; return true })) && replacementDeletes == 0); groups += 1
        var directoryDeletes = 0
        expect(!tllRemoveEmptyDirectoryWithPort(TLLDirectoryRemovalPort(directoryPinned: { true }, entries: { ["other"] }, removeDirectory: { directoryDeletes += 1; return true })) && directoryDeletes == 0); groups += 1
        expect(!tllRemoveEmptyDirectoryWithPort(TLLDirectoryRemovalPort(directoryPinned: { false }, entries: { [] }, removeDirectory: { directoryDeletes += 1; return true })) && directoryDeletes == 0); groups += 1
        expect(tllRemoveEmptyDirectoryWithPort(TLLDirectoryRemovalPort(directoryPinned: { true }, entries: { [] }, removeDirectory: { directoryDeletes += 1; return true })) && directoryDeletes == 1); groups += 1
        expect(TLLRecoveryPhase.allCases.map(\.rawValue) == ["CAPTURE_BASELINE", "API_DELETE", "SIDECAR_RECONCILE", "DIRECTORY_REMOVE", "FINAL_VERIFY"]); groups += 1
        expect(TLLRecoveryPhase.allCases.map(\.expectedSequence) == [0, 2, 3, 4, 5]); groups += 1
        let login = TLLKeychainEntry(path: tllLoginPath, device: 1, inode: 2)
        let extra = TLLKeychainEntry(path: "/synthetic/common.keychain-db", device: 1, inode: 3)
        let baseline = TLLKeychainBaseline(defaultPath: tllLoginPath,
            effectiveSearch: [login, extra], userSearch: [login])
        expect(tllValidKeychainBaseline(baseline, login: login)); groups += 1
        expect(tllValidKeychainBaseline(TLLKeychainBaseline(defaultPath: tllLoginPath,
            effectiveSearch: [login], userSearch: [login]), login: login)); groups += 1
        expect(!tllValidKeychainBaseline(TLLKeychainBaseline(defaultPath: "/other",
            effectiveSearch: [login, extra], userSearch: [login]), login: login)); groups += 1
        expect(!tllValidKeychainBaseline(TLLKeychainBaseline(defaultPath: tllLoginPath,
            effectiveSearch: [login, extra], userSearch: [login, extra]), login: login)); groups += 1
        expect(!tllValidKeychainBaseline(TLLKeychainBaseline(defaultPath: tllLoginPath,
            effectiveSearch: [extra], userSearch: [login]), login: login)); groups += 1
        expect(!tllValidKeychainBaseline(TLLKeychainBaseline(defaultPath: tllLoginPath,
            effectiveSearch: [login, login], userSearch: [login]), login: login)); groups += 1
        expect(!tllValidKeychainBaseline(TLLKeychainBaseline(defaultPath: tllLoginPath,
            effectiveSearch: [login, TLLKeychainEntry(path: "/alias", device: 1, inode: 2)],
            userSearch: [login]), login: login)); groups += 1
        expect(!tllValidKeychainBaseline(TLLKeychainBaseline(defaultPath: tllLoginPath,
            effectiveSearch: [login, TLLKeychainEntry(path: "/fixture",
                device: TLLPinnedIdentity.main.device, inode: TLLPinnedIdentity.main.inode)],
            userSearch: [login]), login: login)); groups += 1
        expect(!tllValidKeychainBaseline(TLLKeychainBaseline(defaultPath: tllLoginPath,
            effectiveSearch: [login, TLLKeychainEntry(path: "/sidecar-alias",
                device: TLLPinnedIdentity.sidecar.device, inode: TLLPinnedIdentity.sidecar.inode)],
            userSearch: [login]), login: login)); groups += 1
        let changedExtra = TLLKeychainBaseline(defaultPath: tllLoginPath,
            effectiveSearch: [login, TLLKeychainEntry(path: extra.path, device: 1, inode: 4)],
            userSearch: [login])
        expect(tllValidKeychainBaseline(changedExtra, login: login)
            && changedExtra != baseline); groups += 1
        let reordered = TLLKeychainBaseline(defaultPath: tllLoginPath,
            effectiveSearch: [extra, login], userSearch: [login])
        expect(tllValidKeychainBaseline(reordered, login: login)
            && reordered != baseline); groups += 1
        let journal = TLLRecoveryV2Journal(runId: "00000000-0000-4000-8000-000000000000",
            sourceSha256: String(repeating: "a", count: 64), binarySha256: String(repeating: "b", count: 64),
            baselineSha256: nil, phase: .captureBaseline,
            phaseDeadline: Date(timeIntervalSince1970: 10), runDeadline: Date(timeIntervalSince1970: 20))
        let payload = TLLBaselinePayload(baseline, journal: journal)
        let encoded = try! JSONEncoder().encode(payload)
        let decoded = try! JSONDecoder().decode(TLLBaselinePayload.self, from: encoded)
        expect(decoded.baseline(journal: journal) == baseline); groups += 1
        let swapped = TLLBaselinePayload(reordered, journal: journal)
        expect(swapped.baseline(journal: journal) != baseline); groups += 1
        let wrongRun = TLLRecoveryV2Journal(runId: "00000000-0000-4000-8000-000000000001",
            sourceSha256: journal.sourceSha256, binarySha256: journal.binarySha256,
            baselineSha256: nil, phase: .captureBaseline,
            phaseDeadline: journal.phaseDeadline, runDeadline: journal.runDeadline)
        expect(decoded.baseline(journal: wrongRun) == nil); groups += 1
        var finalDeletes = 0, targetStillPinned = true
        expect(!tllGuardedEffect(expected: baseline, observe: {
            targetStillPinned = false; return baseline }, target: { targetStillPinned },
            effect: { finalDeletes += 1; return true }) && finalDeletes == 0); groups += 1
        let phaseObservations = [baseline, changedExtra, baseline]
        for observed in phaseObservations {
            let before = finalDeletes
            let passed = tllGuardedEffect(expected: baseline, observe: { observed },
                target: { true }, effect: { finalDeletes += 1; return true })
            expect(passed == (observed == baseline) && finalDeletes == before + (passed ? 1 : 0))
            groups += 1
        }
        expect(!TLL_FIXTURE_RECOVERY_V2_ENABLED); groups += 1
        print("PASS \(groups) offline native fixture recovery groups")
    }
}
#endif
