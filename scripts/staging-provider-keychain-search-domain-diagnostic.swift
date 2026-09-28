// Disabled Stage 3 diagnostic. Reads only Keychain search-list metadata; never opens an item.
import Darwin
import Foundation
#if !TLL_SEARCH_DOMAIN_OFFLINE_TEST
import Security
#endif

private let tllSearchDomainDiagnosticEnabled = false
private let loginPath = NSHomeDirectory() + "/Library/Keychains/login.keychain-db"

private enum Domain: String {
    case user = "USER", system = "SYSTEM", common = "COMMON", dynamic = "DYNAMIC", unknown = "UNKNOWN"
}

private struct Snapshot {
    let domain: Domain?
    let current: [String]?
    let user: [String]?
    let loginIdentity: (dev_t, ino_t)?
    let identities: [(dev_t, ino_t)?]?
}

private func bucket(_ count: Int) -> String { count > 8 ? "9PLUS" : String(count) }

private func classify(_ value: Snapshot) -> String {
    guard let domain = value.domain, let current = value.current, let user = value.user,
          let identities = value.identities, identities.count == current.count else {
        return "READ_UNAVAILABLE"
    }
    let exact = current.filter { $0 == loginPath }.count
    let equivalent = value.loginIdentity.map { login in
        identities.filter { item in item.map { $0 == login } ?? false }.count
    } ?? 0
    let identityState = value.loginIdentity == nil || identities.contains(where: { $0 == nil })
        ? "INCOMPLETE" : "COMPLETE"
    // Fixed fields only: no path, inode, Security error or Keychain item is emitted.
    return "DOMAIN_\(domain.rawValue):CURRENT_\(bucket(current.count)):USER_\(bucket(user.count))"
        + ":EXACT_\(bucket(exact)):SAMEFILE_\(bucket(equivalent))"
        + ":USER_EXACT_\(bucket(user.filter { $0 == loginPath }.count))"
        + ":LISTS_\(current == user ? "SAME" : "DIFFERENT"):IDENTITY_\(identityState)"
}

#if !TLL_SEARCH_DOMAIN_OFFLINE_TEST
private func path(_ keychain: SecKeychain) -> String? {
    var buffer = [CChar](repeating: 0, count: 4096)
    var length = UInt32(buffer.count)
    guard SecKeychainGetPath(keychain, &length, &buffer) == errSecSuccess,
          length < UInt32(buffer.count) else { return nil }
    return String(cString: buffer)
}

private func paths(_ list: CFArray?) -> [String]? {
    guard let list else { return nil }
    var output: [String] = []
    // A bounded observation prevents unusual system state from expanding output or runtime.
    guard CFArrayGetCount(list) <= 32 else { return nil }
    for index in 0..<CFArrayGetCount(list) {
        let raw = CFArrayGetValueAtIndex(list, index)
        let object = unsafeBitCast(raw, to: CFTypeRef.self)
        guard CFGetTypeID(object) == SecKeychainGetTypeID(),
              let itemPath = path(unsafeBitCast(raw, to: SecKeychain.self)) else { return nil }
        output.append(itemPath)
    }
    return output
}

private func identity(_ pathname: String) -> (dev_t, ino_t)? {
    var details = stat()
    guard pathname.withCString({ Darwin.fstatat(AT_FDCWD, $0, &details, 0) }) == 0,
          (details.st_mode & mode_t(S_IFMT)) == mode_t(S_IFREG) else { return nil }
    return (details.st_dev, details.st_ino)
}

private func snapshot() -> Snapshot {
    var selected: SecPreferencesDomain = .user
    let selectedStatus = SecKeychainGetPreferenceDomain(&selected)
    let domain: Domain? = selectedStatus == errSecSuccess ? {
        switch selected {
        case .user: return .user
        case .system: return .system
        case .common: return .common
        case .dynamic: return .dynamic
        default: return .unknown
        }
    }() : nil
    var currentList: CFArray?
    var userList: CFArray?
    let currentStatus = SecKeychainCopySearchList(&currentList)
    let userStatus = SecKeychainCopyDomainSearchList(.user, &userList)
    let current = currentStatus == errSecSuccess ? paths(currentList) : nil
    let user = userStatus == errSecSuccess ? paths(userList) : nil
    return Snapshot(domain: domain, current: current, user: user,
        loginIdentity: identity(loginPath), identities: current?.map(identity))
}

@main private struct TLLSearchDomainMain {
    static func main() {
        guard tllSearchDomainDiagnosticEnabled,
              CommandLine.arguments == [CommandLine.arguments[0], "--read-only"] else { Darwin.exit(31) }
        print(classify(snapshot()))
    }
}
#else
@main private struct TLLSearchDomainOfflineTest {
    static func main() {
        let login = (dev_t(1), ino_t(2))
        let other = (dev_t(1), ino_t(3))
        func value(_ domain: Domain? = .user, _ current: [String]? = [loginPath],
                   _ user: [String]? = [loginPath], _ identities: [(dev_t, ino_t)?]? = [login]) -> Snapshot {
            Snapshot(domain: domain, current: current, user: user,
                loginIdentity: login, identities: identities)
        }
        func expect(_ actual: String, _ expected: String) {
            if actual != expected { Darwin.exit(1) }
        }
        expect(classify(value()), "DOMAIN_USER:CURRENT_1:USER_1:EXACT_1:SAMEFILE_1:USER_EXACT_1:LISTS_SAME:IDENTITY_COMPLETE")
        expect(classify(value(.system, [loginPath, "/extra"], [loginPath], [login, other])),
            "DOMAIN_SYSTEM:CURRENT_2:USER_1:EXACT_1:SAMEFILE_1:USER_EXACT_1:LISTS_DIFFERENT:IDENTITY_COMPLETE")
        expect(classify(value(.user, ["/alias"], [loginPath], [login])),
            "DOMAIN_USER:CURRENT_1:USER_1:EXACT_0:SAMEFILE_1:USER_EXACT_1:LISTS_DIFFERENT:IDENTITY_COMPLETE")
        expect(classify(value(.user, ["/other"], [loginPath], [other])),
            "DOMAIN_USER:CURRENT_1:USER_1:EXACT_0:SAMEFILE_0:USER_EXACT_1:LISTS_DIFFERENT:IDENTITY_COMPLETE")
        expect(classify(value(.user, [loginPath], [loginPath], [nil])),
            "DOMAIN_USER:CURRENT_1:USER_1:EXACT_1:SAMEFILE_0:USER_EXACT_1:LISTS_SAME:IDENTITY_INCOMPLETE")
        expect(classify(value(nil)), "READ_UNAVAILABLE")
        expect(classify(value(.user, nil)), "READ_UNAVAILABLE")
        expect(classify(value(.user, [loginPath], nil)), "READ_UNAVAILABLE")
        expect(classify(value(.user, [loginPath], [loginPath], [])), "READ_UNAVAILABLE")
        if tllSearchDomainDiagnosticEnabled { Darwin.exit(1) }
        print("PASS 9 offline search-domain cases; live diagnostic disabled")
    }
}
#endif
