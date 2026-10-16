// Compiled with -D TLL_KEYCHAIN_TEST: production Keychain adapter/main excluded.
import Foundation
import Security

private final class FakePort: TLLKeychainPort {
    var getStatus: OSStatus = errSecSuccess
    var previous = true
    var disableStatus: OSStatus = errSecSuccess
    var restoreStatus: OSStatus = errSecSuccess
    var readStatus: OSStatus = errSecSuccess
    var readSecret: TLLSecretBuffer? = .fixture(Array("fixture-value".utf8))
    var calls: [String] = []

    func getInteractionAllowed() -> (OSStatus, Bool) {
        calls.append("get")
        return (getStatus, previous)
    }
    func setInteractionAllowed(_ allowed: Bool) -> OSStatus {
        calls.append(allowed ? "set-true" : "set-false")
        return calls.filter { $0.hasPrefix("set-") }.count == 1 ? disableStatus : restoreStatus
    }
    func read(_ item: TLLCredentialItem) -> TLLCredentialReadResult {
        calls.append("read-\(item.rawValue)")
        return TLLCredentialReadResult(status: readStatus, secret: readSecret)
    }
}

private func check(_ condition: @autoclosure () -> Bool, _ label: String) {
    if !condition() { fatalError("offline native reader test failed: \(label)") }
}

@main private struct OfflineTests {
    static func main() {
        var count = 0
        func run(_ label: String, _ body: () -> Void) { body(); count += 1; print("PASS \(label)") }

        run("exact selectors and ordered noninteractive read") {
            for (selector, service, account) in [
                ("supabase", "Supabase CLI", "supabase"),
                ("vercel", "TLL Hosted Baseline Vercel API", "prj_kI5iqqor8Qa63EGRyhsi8e2yxpg4"),
                ("vercel-bypass", "TLL Hosted Baseline Preview Bypass", "prj_kI5iqqor8Qa63EGRyhsi8e2yxpg4"),
            ] {
                let item = TLLCredentialItem(rawValue: selector)!
                check(item.service == service && item.account == account, "selector mapping")
                let port = FakePort()
                var written: [UInt8] = []
                let result = tllReadOnce(selector, port: port) { bytes in written = Array(bytes); return true }
                check(result == .success, "success result")
                check(port.calls == ["get", "set-false", "read-\(selector)", "set-true"], "call order")
                check(written == Array("fixture-value".utf8), "write after restoration")
                check(port.readSecret!.withBytes { $0.allSatisfy { $0 == 0 } }, "actual read buffer wiped")
            }
        }
        run("unknown selector never touches Keychain") {
            let port = FakePort()
            check(tllReadOnce("unknown", port: port) { _ in false } == .guardFailed, "guard result")
            check(port.calls.isEmpty, "no native call")
        }
        run("interaction setting failure stops before read") {
            let port = FakePort(); port.disableStatus = -50
            var wrote = false
            check(tllReadOnce("supabase", port: port) { _ in wrote = true; return true } == .interactionControlFailed, "setting result")
            check(port.calls == ["get", "set-false", "set-true"] && !wrote, "best effort restore")
        }
        run("restoration failure suppresses output") {
            let port = FakePort(); port.restoreStatus = -50
            var wrote = false
            check(tllReadOnce("supabase", port: port) { _ in wrote = true; return true } == .restorationFailed, "restore result")
            check(port.calls.last == "set-true" && !wrote, "no write")
            check(port.readSecret!.withBytes { $0.allSatisfy { $0 == 0 } }, "restore failure wipe")
        }
        run("OSStatus categories stay distinct and secret-free") {
            for (code, expected) in [
                (-25308, TLLCredentialExit.interactionRequired), (-25315, .interactionRequired),
                (-25293, .authenticationFailed), (-25300, .itemMissing),
                (-25291, .keychainUnavailable), (-25294, .keychainUnavailable), (-25295, .keychainUnavailable),
                (-50, .configurationFailed), (-34018, .configurationFailed),
                (-26275, .decodeFailed), (-128, .cancelled), (-99999, .unclassified),
            ] {
                let port = FakePort(); port.readStatus = OSStatus(code)
                var wrote = false
                check(tllReadOnce("vercel", port: port) { _ in wrote = true; return true } == expected, "status \(code)")
                check(!wrote && port.calls.last == "set-true", "failed status output")
                check(port.readSecret!.withBytes { $0.allSatisfy { $0 == 0 } }, "failed status wipe")
            }
        }
        run("invalid and oversized values never write") {
            for value in [[UInt8](), [0, 65, 66, 67, 68, 69, 70, 71], [UInt8](repeating: 65, count: 4097)] {
                let port = FakePort(); port.readSecret = .fixture(value)
                var wrote = false
                check(tllReadOnce("supabase", port: port) { _ in wrote = true; return true } == .invalidOutput, "invalid value")
                check(!wrote, "invalid output suppressed")
                check(port.readSecret!.withBytes { $0.allSatisfy { $0 == 0 } }, "invalid output wipe")
            }
        }
        run("output failure remains categorical") {
            let port = FakePort()
            check(tllReadOnce("supabase", port: port) { _ in false } == .outputFailed, "write failure")
            check(port.readSecret!.withBytes { $0.allSatisfy { $0 == 0 } }, "write failure wipe")
        }
        run("pipe write loop handles partial and interrupted writes") {
            let source = TLLSecretBuffer.fixture(Array("fixture-value".utf8))
            defer { source.wipe() }
            var output: [UInt8] = []
            var calls = 0
            let complete = source.withBytes { bytes in
                tllWriteAll(bytes) { pointer, count in
                    calls += 1
                    if calls == 1 { errno = EINTR; return -1 }
                    let amount = min(3, count)
                    output.append(contentsOf: UnsafeRawBufferPointer(start: pointer, count: amount))
                    return amount
                }
            }
            check(complete && output == Array("fixture-value".utf8) && calls > 2, "partial and EINTR")
            check(!source.withBytes({ tllWriteAll($0) { _, _ in 0 } }), "zero write")
            check(!source.withBytes({ tllWriteAll($0) { _, _ in errno = EPIPE; return -1 } }), "broken pipe")
            check(!source.withBytes({ tllWriteAll($0) { _, count in count + 1 } }), "invalid oversized write")
        }
        run("owned mutable buffer wipe") {
            let buffer = TLLSecretBuffer.fixture([65, 66, 67])
            buffer.wipe()
            check(buffer.withBytes { $0.allSatisfy { $0 == 0 } }, "wipe")
        }
        print("PASS \(count) offline native reader groups")
    }
}
