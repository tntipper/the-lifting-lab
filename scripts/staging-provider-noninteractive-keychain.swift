// Disabled source for a future, separately approved legacy-login-keychain reader.
// Never invoke this executable with real items until fixture qualification and ACL review.
import Darwin
import Foundation
import Security

enum TLLCredentialItem: String {
    case supabase
    case vercel
    case vercelBypass = "vercel-bypass"

    var service: String {
        switch self {
        case .supabase: return "Supabase CLI"
        case .vercel: return "TLL Hosted Baseline Vercel API"
        case .vercelBypass: return "TLL Hosted Baseline Preview Bypass"
        }
    }

    var account: String {
        self == .supabase ? "supabase" : "prj_kI5iqqor8Qa63EGRyhsi8e2yxpg4"
    }
}

enum TLLCredentialExit: Int32 {
    case success = 0
    case guardFailed = 11
    case interactionRequired = 12
    case authenticationFailed = 13
    case itemMissing = 14
    case keychainUnavailable = 15
    case configurationFailed = 16
    case decodeFailed = 17
    case cancelled = 18
    case unclassified = 19
    case invalidOutput = 20
    case interactionControlFailed = 21
    case restorationFailed = 22
    case outputFailed = 23
}

func tllClassifyKeychainStatus(_ status: OSStatus) -> TLLCredentialExit {
    switch status {
    case -25308, -25315: return .interactionRequired
    case -25293: return .authenticationFailed
    case -25300: return .itemMissing
    case -25291, -25294, -25295: return .keychainUnavailable
    case -50, -34018: return .configurationFailed
    case -26275: return .decodeFailed
    case -128: return .cancelled
    default: return .unclassified
    }
}

struct TLLCredentialReadResult {
    let status: OSStatus
    let secret: TLLSecretBuffer?
}

protocol TLLKeychainPort {
    func getInteractionAllowed() -> (OSStatus, Bool)
    func setInteractionAllowed(_ allowed: Bool) -> OSStatus
    func read(_ item: TLLCredentialItem) -> TLLCredentialReadResult
}

final class TLLSecretBuffer {
    let count: Int
    private let storage: UnsafeMutableRawPointer

    init(copying pointer: UnsafeRawPointer, count: Int) {
        precondition(count >= 0 && count <= 8192)
        self.count = count
        storage = .allocate(byteCount: max(1, count), alignment: 1)
        if count > 0 { storage.copyMemory(from: pointer, byteCount: count) }
    }

    #if TLL_KEYCHAIN_TEST
    static func fixture(_ bytes: [UInt8]) -> TLLSecretBuffer {
        // The temporary test fixture array never contains a real credential.
        bytes.withUnsafeBytes { buffer in
            TLLSecretBuffer(copying: buffer.baseAddress ?? UnsafeRawPointer(bitPattern: 1)!, count: buffer.count)
        }
    }
    #endif

    func withBytes<T>(_ body: (UnsafeRawBufferPointer) -> T) -> T {
        body(UnsafeRawBufferPointer(start: storage, count: count))
    }

    func isPrintableCredential() -> Bool {
        (8...4096).contains(count) && withBytes { buffer in
            buffer.allSatisfy { (33...126).contains($0) }
        }
    }

    func wipe() {
        _ = memset_s(storage, max(1, count), 0, max(1, count))
    }

    deinit { wipe(); storage.deallocate() }
}

// The write callback is injected. In production it is a private launcher pipe.
func tllReadOnce(_ selector: String, port: TLLKeychainPort,
                 write: (UnsafeRawBufferPointer) -> Bool) -> TLLCredentialExit {
    guard let item = TLLCredentialItem(rawValue: selector) else { return .guardFailed }
    let (getStatus, previous) = port.getInteractionAllowed()
    guard getStatus == errSecSuccess else { return .interactionControlFailed }
    let disableStatus = port.setInteractionAllowed(false)
    guard disableStatus == errSecSuccess else {
        // A failed setter may have partially changed state. Restore best-effort.
        return port.setInteractionAllowed(previous) == errSecSuccess
            ? .interactionControlFailed : .restorationFailed
    }

    let result = port.read(item)
    let restoreStatus = port.setInteractionAllowed(previous)
    let secret = result.secret
    defer { secret?.wipe() }
    guard restoreStatus == errSecSuccess else { return .restorationFailed }
    guard result.status == errSecSuccess else { return tllClassifyKeychainStatus(result.status) }
    guard let secret, secret.isPrintableCredential() else { return .invalidOutput }
    return secret.withBytes(write) ? .success : .outputFailed
}

func tllWriteAll(_ bytes: UnsafeRawBufferPointer,
                 writeChunk: (UnsafeRawPointer, Int) -> Int) -> Bool {
    guard let base = bytes.baseAddress else { return false }
    var offset = 0
    while offset < bytes.count {
        let written = writeChunk(base.advanced(by: offset), bytes.count - offset)
        if written < 0 && errno == EINTR { continue }
        guard written > 0, written <= bytes.count - offset else { return false }
        offset += written
    }
    return true
}

#if !TLL_KEYCHAIN_TEST
private let TLL_NATIVE_READER_ENABLED = false
private struct TLLRealKeychainPort: TLLKeychainPort {
    func getInteractionAllowed() -> (OSStatus, Bool) {
        var allowed: DarwinBoolean = false
        let status = SecKeychainGetUserInteractionAllowed(&allowed)
        return (status, allowed.boolValue)
    }

    func setInteractionAllowed(_ allowed: Bool) -> OSStatus {
        SecKeychainSetUserInteractionAllowed(allowed)
    }

    func read(_ item: TLLCredentialItem) -> TLLCredentialReadResult {
        // These existing items are in the file-based login keychain. Do not opt
        // into the data-protection or synchronizable keychain implementation.
        let path = NSHomeDirectory() + "/Library/Keychains/login.keychain-db"
        var keychain: SecKeychain?
        let openStatus = SecKeychainOpen(path, &keychain)
        guard openStatus == errSecSuccess, let keychain else {
            return TLLCredentialReadResult(status: openStatus == errSecSuccess ? errSecInvalidKeychain : openStatus,
                                           secret: nil)
        }
        let query: [CFString: Any] = [
            kSecClass: kSecClassGenericPassword,
            kSecAttrService: item.service,
            kSecAttrAccount: item.account,
            kSecMatchSearchList: [keychain],
            kSecMatchLimit: kSecMatchLimitOne,
            kSecReturnData: true,
        ]
        var returned: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &returned)
        guard status == errSecSuccess else { return TLLCredentialReadResult(status: status, secret: nil) }
        guard let returned, CFGetTypeID(returned) == CFDataGetTypeID() else {
            return TLLCredentialReadResult(status: errSecDecode, secret: nil)
        }
        let data = returned as! CFData
        let count = CFDataGetLength(data)
        guard (8...4096).contains(count), let pointer = CFDataGetBytePtr(data) else {
            return TLLCredentialReadResult(status: errSecSuccess, secret: nil)
        }
        // The Security framework owns the original immutable CFData. Only our
        // mutable copy can be wiped; it is released promptly after transfer.
        return TLLCredentialReadResult(status: errSecSuccess,
                                       secret: TLLSecretBuffer(copying: pointer, count: count))
    }
}

private func tllWriteToPrivatePipe(_ bytes: UnsafeRawBufferPointer) -> Bool {
    var info = stat()
    guard fstat(STDOUT_FILENO, &info) == 0, (info.st_mode & mode_t(S_IFMT)) == mode_t(S_IFIFO)
    else { return false }
    // A closed launcher pipe must be a categorical write failure, not SIGPIPE
    // termination before the owned credential buffer is wiped.
    _ = Darwin.signal(SIGPIPE, SIG_IGN)
    return tllWriteAll(bytes) { pointer, count in
        Darwin.write(STDOUT_FILENO, pointer, count)
    }
}

@main private struct TLLMain {
    static func main() {
        guard TLL_NATIVE_READER_ENABLED else { Darwin.exit(TLLCredentialExit.guardFailed.rawValue) }
        guard CommandLine.arguments.count == 2 else { Darwin.exit(TLLCredentialExit.guardFailed.rawValue) }
        let outcome = tllReadOnce(CommandLine.arguments[1], port: TLLRealKeychainPort(), write: tllWriteToPrivatePipe)
        Darwin.exit(outcome.rawValue)
    }
}
#endif
