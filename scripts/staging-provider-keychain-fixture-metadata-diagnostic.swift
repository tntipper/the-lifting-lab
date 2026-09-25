// Disabled, metadata-only investigation of the preserved Stage 3 synthetic fixture.
// No Keychain item read, file contents read, delete, or configuration write exists here.
import Darwin
import Foundation
#if !TLL_FIXTURE_METADATA_OFFLINE_TEST
import Security
#endif

private let tllMetadataDiagnosticEnabled = false
private let tllLoginPath = NSHomeDirectory() + "/Library/Keychains/login.keychain-db"
private let tllFixtureDirectory = NSHomeDirectory() + "/Library/Caches/tll-stage3-keychain-fixture"
private let tllFixtureMain = "tll-stage3-fixture.keychain-db"
private let tllFixtureSidecar = ".flA673ACC0"

private struct TLLMetadataIdentity: Equatable {
    let device: dev_t
    let inode: ino_t
    let owner: uid_t
    let permissions: mode_t
    let links: nlink_t
    let size: off_t
    let kind: mode_t
    init(_ value: stat) {
        device = value.st_dev; inode = value.st_ino; owner = value.st_uid
        permissions = value.st_mode & 0o777; links = value.st_nlink
        size = value.st_size; kind = value.st_mode & mode_t(S_IFMT)
    }
    init(device: dev_t, inode: ino_t, owner: uid_t, permissions: mode_t,
         links: nlink_t, size: off_t, kind: mode_t) {
        self.device = device; self.inode = inode; self.owner = owner
        self.permissions = permissions; self.links = links; self.size = size; self.kind = kind
    }
}

private struct TLLMetadataSnapshot {
    let defaultPath: String?
    let searchPaths: [String]?
    let directory: TLLMetadataIdentity?
    let main: TLLMetadataIdentity?
    let sidecar: TLLMetadataIdentity?
    let entries: [String]?
}

private enum TLLMetadataResult: String {
    case defaultUnreadable = "DEFAULT_UNREADABLE"
    case searchUnreadable = "SEARCH_UNREADABLE"
    case defaultPathMismatch = "DEFAULT_PATH_MISMATCH"
    case searchPathMismatch = "SEARCH_PATH_MISMATCH"
    case directoryMismatch = "DIRECTORY_MISMATCH"
    case mainMismatch = "MAIN_MISMATCH"
    case sidecarMismatch = "SIDECAR_MISMATCH"
    case entriesMismatch = "ENTRIES_MISMATCH"
    case matched = "METADATA_MATCHED"
}

private func tllClassifyMetadata(_ snapshot: TLLMetadataSnapshot) -> TLLMetadataResult {
    guard let defaultPath = snapshot.defaultPath else { return .defaultUnreadable }
    guard let searchPaths = snapshot.searchPaths else { return .searchUnreadable }
    guard defaultPath == tllLoginPath else { return .defaultPathMismatch }
    guard searchPaths == [tllLoginPath] else { return .searchPathMismatch }
    guard let directory = snapshot.directory,
          directory.device == 16777234, directory.inode == 144003366,
          directory.owner == 501, directory.permissions == 0o700,
          directory.kind == mode_t(S_IFDIR) else { return .directoryMismatch }
    guard snapshot.main == TLLMetadataIdentity(device: 16777234, inode: 144003379,
        owner: 501, permissions: 0o644, links: 1, size: 20460, kind: mode_t(S_IFREG)) else { return .mainMismatch }
    guard snapshot.sidecar == TLLMetadataIdentity(device: 16777234, inode: 144003377,
        owner: 501, permissions: 0o444, links: 1, size: 0, kind: mode_t(S_IFREG)) else { return .sidecarMismatch }
    guard snapshot.entries?.sorted() == [tllFixtureMain, tllFixtureSidecar].sorted() else { return .entriesMismatch }
    return .matched
}

#if !TLL_FIXTURE_METADATA_OFFLINE_TEST
private func tllIdentity(_ path: String) -> TLLMetadataIdentity? {
    var value = stat()
    return path.withCString { Darwin.lstat($0, &value) } == 0 ? TLLMetadataIdentity(value) : nil
}

private func tllPath(_ keychain: SecKeychain) -> String? {
    var buffer = [CChar](repeating: 0, count: 4096)
    var length = UInt32(buffer.count)
    guard SecKeychainGetPath(keychain, &length, &buffer) == errSecSuccess,
          length < UInt32(buffer.count) else { return nil }
    return String(cString: buffer)
}

private func tllReadMetadata() -> TLLMetadataSnapshot {
    var defaultKeychain: SecKeychain?
    let defaultPath = SecKeychainCopyDefault(&defaultKeychain) == errSecSuccess
        ? defaultKeychain.flatMap(tllPath) : nil
    var list: CFArray?
    var searchPaths: [String]? = nil
    if SecKeychainCopySearchList(&list) == errSecSuccess, let list {
        var paths: [String] = []
        var valid = true
        for index in 0..<CFArrayGetCount(list) {
            let raw = CFArrayGetValueAtIndex(list, index)
            let object = unsafeBitCast(raw, to: CFTypeRef.self)
            guard CFGetTypeID(object) == SecKeychainGetTypeID() else { valid = false; break }
            let item = unsafeBitCast(raw, to: SecKeychain.self)
            guard let path = tllPath(item) else { valid = false; break }
            paths.append(path)
        }
        if valid { searchPaths = paths }
    }
    let entries = try? FileManager.default.contentsOfDirectory(atPath: tllFixtureDirectory)
    return TLLMetadataSnapshot(defaultPath: defaultPath, searchPaths: searchPaths,
        directory: tllIdentity(tllFixtureDirectory),
        main: tllIdentity(tllFixtureDirectory + "/" + tllFixtureMain),
        sidecar: tllIdentity(tllFixtureDirectory + "/" + tllFixtureSidecar), entries: entries)
}

@main private struct TLLMetadataMain {
    static func main() {
        guard tllMetadataDiagnosticEnabled, CommandLine.arguments == [CommandLine.arguments[0], "--read-only"]
        else { Darwin.exit(31) }
        print(tllClassifyMetadata(tllReadMetadata()).rawValue)
    }
}
#else
@main private struct TLLMetadataOfflineTest {
    static func main() {
        let directory = TLLMetadataIdentity(device: 16777234, inode: 144003366,
            owner: 501, permissions: 0o700, links: 2, size: 0, kind: mode_t(S_IFDIR))
        let main = TLLMetadataIdentity(device: 16777234, inode: 144003379,
            owner: 501, permissions: 0o644, links: 1, size: 20460, kind: mode_t(S_IFREG))
        let sidecar = TLLMetadataIdentity(device: 16777234, inode: 144003377,
            owner: 501, permissions: 0o444, links: 1, size: 0, kind: mode_t(S_IFREG))
        func snapshot(_ defaultPath: String? = tllLoginPath, _ searchPaths: [String]? = [tllLoginPath],
                      _ directoryValue: TLLMetadataIdentity? = directory,
                      _ mainValue: TLLMetadataIdentity? = main,
                      _ sidecarValue: TLLMetadataIdentity? = sidecar,
                      _ entries: [String]? = [tllFixtureMain, tllFixtureSidecar]) -> TLLMetadataSnapshot {
            TLLMetadataSnapshot(defaultPath: defaultPath, searchPaths: searchPaths,
                directory: directoryValue, main: mainValue, sidecar: sidecarValue, entries: entries)
        }
        func expect(_ actual: TLLMetadataResult, _ expected: TLLMetadataResult) {
            if actual != expected { Darwin.exit(1) }
        }
        expect(tllClassifyMetadata(snapshot()), .matched)
        expect(tllClassifyMetadata(snapshot(nil)), .defaultUnreadable)
        expect(tllClassifyMetadata(snapshot(tllLoginPath, nil)), .searchUnreadable)
        expect(tllClassifyMetadata(snapshot(tllLoginPath + "-other")), .defaultPathMismatch)
        expect(tllClassifyMetadata(snapshot(tllLoginPath, [tllLoginPath, tllLoginPath])), .searchPathMismatch)
        expect(tllClassifyMetadata(snapshot(tllLoginPath, [tllLoginPath], nil)), .directoryMismatch)
        expect(tllClassifyMetadata(snapshot(tllLoginPath, [tllLoginPath], directory, nil)), .mainMismatch)
        expect(tllClassifyMetadata(snapshot(tllLoginPath, [tllLoginPath], directory, main, nil)), .sidecarMismatch)
        expect(tllClassifyMetadata(snapshot(tllLoginPath, [tllLoginPath], directory, main, sidecar, [])), .entriesMismatch)
        if tllMetadataDiagnosticEnabled { Darwin.exit(1) }
        print("PASS 9 offline metadata categories; live diagnostic disabled")
    }
}
#endif
