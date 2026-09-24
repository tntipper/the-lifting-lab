// Fixed-target recovery for the failed Stage 3 synthetic Keychain V1 fixture.
// This program is deliberately disabled.  It accepts exactly one recovery
// phase and has no path, credential, selector, or environment configuration.
import Darwin
import CryptoKit
import Foundation

#if !TLL_FIXTURE_RECOVERY_NATIVE_TEST
import Security
#endif

#if !TLL_KEYCHAIN_FIXTURE_RECOVERY
#error("Compile this recovery helper only with TLL_KEYCHAIN_FIXTURE_RECOVERY")
#endif

private let TLL_FIXTURE_RECOVERY_ENABLED = false
private let tllRecoveryCachesDirectory = NSHomeDirectory() + "/Library/Caches"
private let tllRecoveryDirectoryLeaf = "tll-stage3-keychain-fixture"
private let tllRecoveryDirectory = tllRecoveryCachesDirectory + "/" + tllRecoveryDirectoryLeaf
private let tllRecoveryMain = "tll-stage3-fixture.keychain-db"
private let tllRecoverySidecar = ".flA673ACC0"
private let tllRecoveryJournal = "tll-provider-keychain-fixture-recovery-v1.json"
private let tllRecoveryBuildReceipt = "tll-provider-keychain-fixture-recovery-armed-v1.build.json"
private let tllV1ParentJournal = "tll-provider-keychain-fixture-v1.json"
private let tllV1NativeJournal = "tll-provider-keychain-fixture-native-v1.json"
private let tllV1RunID = "c02a3356-3c57-4d1f-adee-eb940cf1f87a"

private enum TLLRecoveryPhase: String, CaseIterable {
    case apiDelete = "API_DELETE"
    case sidecarReconcile = "SIDECAR_RECONCILE"
    case directoryRemove = "DIRECTORY_REMOVE"
    var expectedSequence: Int {
        switch self { case .apiDelete: return 1; case .sidecarReconcile: return 2; case .directoryRemove: return 3 }
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
    guard let bytes = try? Data(contentsOf: URL(fileURLWithPath: path)) else { return nil }
    return SHA256.hash(data: bytes).map { String(format: "%02x", $0) }.joined()
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

private func tllPrivateRegular(_ path: URL, maximumSize: off_t) -> Bool {
    var info = stat()
    return lstat(path.path, &info) == 0 && (info.st_mode & mode_t(S_IFMT)) == mode_t(S_IFREG)
        && info.st_uid == getuid() && info.st_nlink == 1 && (info.st_mode & 0o777) == 0o600
        && info.st_size >= 0 && info.st_size <= maximumSize
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

private struct TLLRecoveryJournal {
    let runId: String; let sourceSha256: String; let phase: TLLRecoveryPhase
    let phaseDeadline: Date; let runDeadline: Date
    static let exactKeys: Set<String> = ["schema", "runId", "sourceSha256", "binarySha256", "sequence",
        "phase", "startedAt", "updatedAt", "phaseDeadlineAt", "runDeadlineAt", "outcome"]
    static func load(phase expected: TLLRecoveryPhase, now: Date = Date()) -> TLLRecoveryJournal? {
        let root = URL(fileURLWithPath: FileManager.default.currentDirectoryPath).standardizedFileURL
        guard root.lastPathComponent == "implementation-integration" else { return nil }
        let state = root.deletingLastPathComponent().appendingPathComponent("implementation-state/staging")
        let path = state.appendingPathComponent(tllRecoveryJournal)
        guard tllPrivateRegular(path, maximumSize: 4_096), let bytes = try? Data(contentsOf: path),
              let object = try? JSONSerialization.jsonObject(with: bytes) as? [String: Any],
              Set(object.keys) == exactKeys, object["schema"] as? String == "tll-stage3-fixture-recovery/v1",
              object["sequence"] as? Int == expected.expectedSequence, object["phase"] as? String == expected.rawValue,
              object["outcome"] is NSNull,
              let runId = object["runId"] as? String,
              runId.range(of: "^[0-9a-f-]{36}$", options: .regularExpression) != nil,
              let source = object["sourceSha256"] as? String, let binary = object["binarySha256"] as? String,
              source.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil,
              binary.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil,
              let phaseText = object["phaseDeadlineAt"] as? String, let runText = object["runDeadlineAt"] as? String,
              let phaseDeadline = parse(phaseText), let runDeadline = parse(runText),
              min(phaseDeadline, runDeadline) > now,
              tllHash(root.appendingPathComponent("scripts/staging-provider-keychain-fixture-recovery-native.swift").path) == source,
              buildReceipt(state, source: source, binary: binary)
        else { return nil }
        // The two V1 journals must be preserved terminal evidence.  The helper
        // reads only their state labels and never opens either as a Keychain.
        guard parentTerminal(state.appendingPathComponent(tllV1ParentJournal)),
              nativeTerminal(state.appendingPathComponent(tllV1NativeJournal)) else { return nil }
        return TLLRecoveryJournal(runId: runId, sourceSha256: source, phase: expected,
                                  phaseDeadline: phaseDeadline, runDeadline: runDeadline)
    }
    private static func parse(_ value: String) -> Date? {
        let f = ISO8601DateFormatter(); f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f.date(from: value) ?? ISO8601DateFormatter().date(from: value)
    }
    private static func parentTerminal(_ path: URL) -> Bool {
        guard tllPrivateRegular(path, maximumSize: 4_096), let bytes = try? Data(contentsOf: path),
              let object = try? JSONSerialization.jsonObject(with: bytes) as? [String: Any] else { return false }
        return object["schema"] as? String == "tll-stage3-disposable-keychain-fixture/v1"
            && object["runId"] as? String == tllV1RunID && object["sequence"] as? Int == 3
            && object["phase"] as? String == "LOCAL_RECONCILIATION" && object["outcome"] as? String == "HOLD"
    }
    private static func nativeTerminal(_ path: URL) -> Bool {
        guard tllPrivateRegular(path, maximumSize: 4_096), let bytes = try? Data(contentsOf: path),
              let object = try? JSONSerialization.jsonObject(with: bytes) as? [String: Any] else { return false }
        return object["schema"] as? String == "tll-stage3-disposable-keychain-native/v1"
            && object["runId"] as? String == tllV1RunID && object["sequence"] as? Int == 1
            && object["operation"] as? String == "CREATE" && object["status"] as? String == "COMPLETE"
            && object["outcome"] as? String == "HOLD"
    }
    private static func buildReceipt(_ state: URL, source: String, binary: String) -> Bool {
        let path = state.appendingPathComponent(tllRecoveryBuildReceipt)
        let executable = state.appendingPathComponent("tll-provider-keychain-fixture-recovery-armed-v1")
        var executableInfo = stat()
        guard tllPrivateRegular(path, maximumSize: 4_096),
              lstat(executable.path, &executableInfo) == 0,
              (executableInfo.st_mode & mode_t(S_IFMT)) == mode_t(S_IFREG), executableInfo.st_uid == getuid(),
              executableInfo.st_nlink == 1, (executableInfo.st_mode & 0o777) == 0o700,
              tllHashBoundRegularPath(executable.path) == binary,
              let bytes = try? Data(contentsOf: path),
              let object = try? JSONSerialization.jsonObject(with: bytes) as? [String: Any],
              Set(object.keys) == Set(["schema", "sourceSha256", "binarySha256", "architecture", "signingIdentifier", "signingKind"])
        else { return false }
        return object["schema"] as? String == "tll-fixture-recovery-armed-build/v1"
            && object["sourceSha256"] as? String == source && object["binarySha256"] as? String == binary
            && object["architecture"] as? String == "arm64"
            && object["signingIdentifier"] as? String == "tll-provider-keychain-fixture-recovery-armed-v1"
            && object["signingKind"] as? String == "adhoc"
    }
}

#if !TLL_FIXTURE_RECOVERY_NATIVE_TEST
private struct TLLKeychainBaseline: Equatable { let defaultPath: String; let searchPaths: [String] }
private let tllExpectedBaseline = TLLKeychainBaseline(
    defaultPath: NSHomeDirectory() + "/Library/Keychains/login.keychain-db",
    searchPaths: [NSHomeDirectory() + "/Library/Keychains/login.keychain-db"])
private func tllKeychainPath(_ keychain: SecKeychain) -> String? {
    var buffer = [CChar](repeating: 0, count: 4096); var length = UInt32(buffer.count)
    guard SecKeychainGetPath(keychain, &length, &buffer) == errSecSuccess, length < UInt32(buffer.count) else { return nil }
    return String(cString: buffer)
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
    var current: SecKeychain?; var list: CFArray?
    guard SecKeychainCopyDefault(&current) == errSecSuccess, let current, let path = tllKeychainPath(current),
          SecKeychainCopySearchList(&list) == errSecSuccess, let list else { return nil }
    var paths: [String] = []
    for index in 0..<CFArrayGetCount(list) {
        let raw = CFArrayGetValueAtIndex(list, index)
        let object = unsafeBitCast(raw, to: CFTypeRef.self)
        guard CFGetTypeID(object) == SecKeychainGetTypeID() else { return nil }
        let item = unsafeBitCast(raw, to: SecKeychain.self)
        guard let itemPath = tllKeychainPath(item) else { return nil }
        paths.append(itemPath)
    }
    return TLLKeychainBaseline(defaultPath: path, searchPaths: paths)
} }
private func tllApiDelete() -> Bool {
    guard let before = tllBaseline(), before == tllExpectedBaseline, tllSyntheticObjectsMatch() else { return false }
    return tllWithInteractionDisabled {
        var keychain: SecKeychain?
        guard SecKeychainOpen(tllRecoveryDirectory + "/" + tllRecoveryMain, &keychain) == errSecSuccess,
              let keychain, tllKeychainPath(keychain) == tllRecoveryDirectory + "/" + tllRecoveryMain,
              tllSyntheticObjectsMatch(), tllBaseline() == tllExpectedBaseline,
              SecKeychainDelete(keychain) == errSecSuccess else { return false }
        // No unlink fallback: a surviving main Keychain is a HOLD.
        return !FileManager.default.fileExists(atPath: tllRecoveryDirectory + "/" + tllRecoveryMain)
            && tllBaseline() == before
    } == true
}
private func tllRemoveSidecar() -> Bool {
    guard let before = tllBaseline(), before == tllExpectedBaseline else { return false }
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
            directoryPinned: { tllPinnedDirectoryFD(fd, filesystem) && tllBaseline() == tllExpectedBaseline },
            entries: { tllExactDirectoryEntries() }, sidecar: { state },
            unlinkSidecar: {
                // POSIX unlinkat addresses a name, not an open file descriptor.
                // Revalidate the fixed sidecar and directory immediately before
                // the call; a mismatch or an unexpected postcheck is a HOLD.
                var current = stat()
                return filesystem.fstatat(fd, tllRecoverySidecar, &current, AT_SYMLINK_NOFOLLOW) == 0
                    && TLLObservedIdentity(current).matches(.sidecar)
                    && tllPinnedDirectoryFD(fd, filesystem)
                    && filesystem.unlinkat(fd, tllRecoverySidecar, 0) == 0
            }))
    } == true
    return result && tllBaseline() == before
}
private func tllRemoveEmptyDirectory() -> Bool {
    guard let before = tllBaseline(), before == tllExpectedBaseline else { return false }
    let result = tllRemoveEmptyDirectoryWithPort(TLLDirectoryRemovalPort(
        directoryPinned: { tllWithPinnedDirectory(.real, { _ in true }) == true && tllBaseline() == tllExpectedBaseline },
        entries: { tllExactDirectoryEntries() },
        removeDirectory: {
            // Deletion is anchored to a no-follow descriptor for Library/Caches,
            // which rechecks the exact child identity immediately before unlinkat.
            tllWithRecoveryParent(.real, { parent in
                TLLRecoveryFilesystem.real.unlinkat(parent, tllRecoveryDirectoryLeaf, AT_REMOVEDIR) == 0
            }) == true
        }))
    guard result else { return false }
    return !FileManager.default.fileExists(atPath: tllRecoveryDirectory) && tllBaseline() == before
}
@main private struct TLLRecoveryMain {
    static func main() {
        guard TLL_FIXTURE_RECOVERY_ENABLED,
              CommandLine.arguments.count == 2,
              let phase = TLLRecoveryPhase(rawValue: CommandLine.arguments[1]),
              TLLRecoveryJournal.load(phase: phase) != nil else { Darwin.exit(TLLRecoveryExit.guardFailed.rawValue) }
        let result: Bool
        switch phase { case .apiDelete: result = tllApiDelete(); case .sidecarReconcile: result = tllRemoveSidecar(); case .directoryRemove: result = tllRemoveEmptyDirectory() }
        if result { print(phase.rawValue + "_PASS") }
        Darwin.exit(result ? TLLRecoveryExit.pass.rawValue : TLLRecoveryExit.hold.rawValue)
    }
}
#else
@main private struct TLLRecoveryOfflineTests {
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
        expect(TLLRecoveryPhase.allCases.map(\.rawValue) == ["API_DELETE", "SIDECAR_RECONCILE", "DIRECTORY_REMOVE"]); groups += 1
        expect(TLLRecoveryPhase.allCases.map(\.expectedSequence) == [1, 2, 3]); groups += 1
        expect(!TLL_FIXTURE_RECOVERY_ENABLED); groups += 1
        print("PASS \(groups) offline native fixture recovery groups")
    }
}
#endif
