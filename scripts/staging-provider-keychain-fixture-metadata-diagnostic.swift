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

private func tllPinnedDirectory(_ directory: TLLMetadataIdentity?) -> Bool {
    guard let directory else { return false }
    return directory.device == 16777234 && directory.inode == 144003366
        && directory.owner == 501 && directory.permissions == 0o700
        && directory.kind == mode_t(S_IFDIR)
}

private func tllOnlyReadPinnedFixture<T>(_ directory: TLLMetadataIdentity?,
                                          _ readChildren: () -> T) -> T? {
    guard tllPinnedDirectory(directory) else { return nil }
    return readChildren()
}

private func tllClassifyMetadata(_ snapshot: TLLMetadataSnapshot) -> TLLMetadataResult {
    guard let defaultPath = snapshot.defaultPath else { return .defaultUnreadable }
    guard let searchPaths = snapshot.searchPaths else { return .searchUnreadable }
    guard defaultPath == tllLoginPath else { return .defaultPathMismatch }
    guard searchPaths == [tllLoginPath] else { return .searchPathMismatch }
    guard tllPinnedDirectory(snapshot.directory) else { return .directoryMismatch }
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

private func tllIdentityAt(_ fd: Int32, _ leaf: String) -> TLLMetadataIdentity? {
    var value = stat()
    return leaf.withCString { Darwin.fstatat(fd, $0, &value, AT_SYMLINK_NOFOLLOW) } == 0
        ? TLLMetadataIdentity(value) : nil
}

private func tllDirectoryEntries(_ fd: Int32) -> [String]? {
    let duplicate = Darwin.dup(fd)
    guard duplicate >= 0 else { return nil }
    guard let stream = Darwin.fdopendir(duplicate) else { _ = Darwin.close(duplicate); return nil }
    defer { _ = Darwin.closedir(stream) }
    var names: [String] = []
    errno = 0
    while let entry = Darwin.readdir(stream) {
        let name = withUnsafePointer(to: entry.pointee.d_name) { pointer in
            pointer.withMemoryRebound(to: CChar.self, capacity: Int(MAXNAMLEN) + 1) { String(cString: $0) }
        }
        if name != "." && name != ".." { names.append(name) }
        errno = 0
    }
    return errno == 0 ? names : nil
}

private func tllFixtureMetadata() -> (TLLMetadataIdentity?, TLLMetadataIdentity?, TLLMetadataIdentity?, [String]?) {
    let namedBefore = tllIdentity(tllFixtureDirectory)
    guard tllPinnedDirectory(namedBefore) else { return (namedBefore, nil, nil, nil) }
    let fd = tllFixtureDirectory.withCString { Darwin.open($0, O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC) }
    guard fd >= 0 else { return (nil, nil, nil, nil) }
    defer { _ = Darwin.close(fd) }
    var opened = stat()
    guard Darwin.fstat(fd, &opened) == 0 else { return (nil, nil, nil, nil) }
    let directory = TLLMetadataIdentity(opened)
    guard namedBefore == directory else { return (nil, nil, nil, nil) }
    let children = tllOnlyReadPinnedFixture(directory) {
        (tllIdentityAt(fd, tllFixtureMain), tllIdentityAt(fd, tllFixtureSidecar), tllDirectoryEntries(fd))
    }
    guard let children, tllIdentity(tllFixtureDirectory) == directory else { return (nil, nil, nil, nil) }
    return (directory, children.0, children.1, children.2)
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
    let fixture = tllFixtureMetadata()
    return TLLMetadataSnapshot(defaultPath: defaultPath, searchPaths: searchPaths,
        directory: fixture.0, main: fixture.1, sidecar: fixture.2, entries: fixture.3)
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
        let replacedDirectory = TLLMetadataIdentity(device: 16777234, inode: 7,
            owner: 501, permissions: 0o700, links: 2, size: 0, kind: mode_t(S_IFDIR))
        var childReads = 0
        let rejected: Int? = tllOnlyReadPinnedFixture(replacedDirectory) { childReads += 1; return 1 }
        if rejected != nil || childReads != 0 { Darwin.exit(1) }
        expect(tllClassifyMetadata(snapshot(tllLoginPath, [tllLoginPath], replacedDirectory)), .directoryMismatch)
        let replacedMain = TLLMetadataIdentity(device: 16777234, inode: 8,
            owner: 501, permissions: 0o644, links: 1, size: 20460, kind: mode_t(S_IFREG))
        expect(tllClassifyMetadata(snapshot(tllLoginPath, [tllLoginPath], directory, replacedMain)), .mainMismatch)
        let linkedMain = TLLMetadataIdentity(device: 16777234, inode: 144003379,
            owner: 501, permissions: 0o644, links: 2, size: 20460, kind: mode_t(S_IFREG))
        expect(tllClassifyMetadata(snapshot(tllLoginPath, [tllLoginPath], directory, linkedMain)), .mainMismatch)
        let wrongOwner = TLLMetadataIdentity(device: 16777234, inode: 144003379,
            owner: 502, permissions: 0o644, links: 1, size: 20460, kind: mode_t(S_IFREG))
        expect(tllClassifyMetadata(snapshot(tllLoginPath, [tllLoginPath], directory, wrongOwner)), .mainMismatch)
        let symlinkMain = TLLMetadataIdentity(device: 16777234, inode: 144003379,
            owner: 501, permissions: 0o644, links: 1, size: 20460, kind: mode_t(S_IFLNK))
        expect(tllClassifyMetadata(snapshot(tllLoginPath, [tllLoginPath], directory, symlinkMain)), .mainMismatch)
        let wrongSize = TLLMetadataIdentity(device: 16777234, inode: 144003377,
            owner: 501, permissions: 0o444, links: 1, size: 1, kind: mode_t(S_IFREG))
        expect(tllClassifyMetadata(snapshot(tllLoginPath, [tllLoginPath], directory, main, wrongSize)), .sidecarMismatch)
        if tllMetadataDiagnosticEnabled { Darwin.exit(1) }
        print("PASS 16 offline metadata cases; live diagnostic disabled")
    }
}
#endif
