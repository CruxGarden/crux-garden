import Foundation
import Photos
import CryptoKit
import Darwin

// Private inherited pipe only. No paths, database, listener or authorization request.
let maxRequest = 65_536
let maxReply = 524_288
let pageSize = 20
let maxAssets = 20_000
let maxHandles = 100_000
let maxResourceBytes: Int64 = 64 * 1024 * 1024 * 1024
struct BridgeError: Error { let code: String; init(_ code: String) { self.code = code } }
func digest(_ value: Any) throws -> String {
    let data = try JSONSerialization.data(withJSONObject: value, options: [.sortedKeys])
    return SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
}
func emit(_ value: [String: Any]) throws {
    var data = try JSONSerialization.data(withJSONObject: value, options: [.sortedKeys])
    guard data.count <= maxReply else { throw BridgeError("reply_too_large") }
    data.append(10)
    try FileHandle.standardOutput.write(contentsOf: data)
}
func role(_ type: Int) -> String {
    switch type {
    case 1: return "originalPhoto"
    case 2: return "originalVideo"
    case 3: return "originalAudio"
    case 4: return "alternatePhoto"
    case 5: return "currentPhoto"
    case 6: return "currentVideo"
    case 7: return "adjustmentData"
    case 8: return "adjustmentBasePhoto"
    case 9: return "originalPairedVideo"
    case 10: return "currentPairedVideo"
    case 11: return "adjustmentBasePairedVideo"
    case 12: return "adjustmentBaseVideo"
    default: return "unknown"
    }
}
struct ResourceView {
    let type: Int
    let filename: String
    let uti: String
    let native: PHAssetResource?
    var json: [String: Any] { ["type": type, "role": role(type), "filename": filename, "uti": uti] }
}
struct AssetView {
    let id: String
    let modified: Double?
    let resources: [ResourceView]
    var revision: String { get throws {
        try digest(["id": id, "modified": modified as Any? ?? NSNull(), "resources": resources.map { $0.json }])
    } }
}
protocol Source {
    func status() -> String
    func open() throws -> Int
    func asset(_ index: Int) throws -> AssetView
    func refresh(_ id: String) throws -> AssetView
    func read(_ resource: ResourceView, network: Bool, chunk: @escaping (Data) throws -> Void) throws
}

#if PHOTOKIT_FIXTURE
// In-memory fixtures compile into a distinct test binary. No fixture path/input in production.
final class FixtureSource: Source {
    var permission = "notDetermined"
    var failure = ""
    var version = 1.0
    func status() -> String { permission }
    func open() throws -> Int { 23 }
    func asset(_ index: Int) throws -> AssetView {
        guard (0..<23).contains(index) else { throw BridgeError("asset_unavailable") }
        let types = index == 0 ? [1,9] : index == 1 ? [1,4] : index == 2 ? [1,5,7] : [1]
        return AssetView(id: "fixture-\(index)", modified: version, resources: types.map {
            ResourceView(type: $0, filename: "same-name.dat", uti: "public.data", native: nil)
        })
    }
    func refresh(_ id: String) throws -> AssetView {
        guard let index = Int(id.replacingOccurrences(of: "fixture-", with: "")) else { throw BridgeError("asset_unavailable") }
        return try asset(index)
    }
    func read(_ resource: ResourceView, network: Bool, chunk: @escaping (Data) throws -> Void) throws {
        if failure == "needsNetwork" && !network { throw BridgeError("network_required") }
        if failure == "stall" || (failure == "stallPaired" && resource.type == 9) { Thread.sleep(forTimeInterval: 10) }
        try chunk(Data("fixture-role-\(resource.type):".utf8))
        if failure == "partial" || (failure == "partialPaired" && resource.type == 9) { throw BridgeError("resource_failed") }
        try chunk(Data(repeating: 42, count: 150_000))
        if failure == "changedAfter" { version += 1 }
    }
}
#else
final class PhotoSource: Source {
    var assets: PHFetchResult<PHAsset>?
    func status() -> String {
        switch PHPhotoLibrary.authorizationStatus(for: .readWrite) {
        case .notDetermined: return "notDetermined"
        case .restricted: return "restricted"
        case .denied: return "denied"
        case .authorized: return "authorized"
        case .limited: return "limited"
        @unknown default: return "unknown"
        }
    }
    func open() throws -> Int {
        let options = PHFetchOptions()
        options.fetchLimit = maxAssets + 1
        options.includeHiddenAssets = false
        options.includeAllBurstAssets = false
        // A session fetch result is a bounded discovery view, not a completeness claim.
        let result = PHAsset.fetchAssets(with: options)
        guard result.count <= maxAssets else { throw BridgeError("library_too_large") }
        assets = result
        return result.count
    }
    func view(_ asset: PHAsset) throws -> AssetView {
        let resources = PHAssetResource.assetResources(for: asset)
        guard resources.count <= 32 else { throw BridgeError("too_many_resources") }
        let views = try resources.map { resource -> ResourceView in
            // Public APIs available at the macOS 13 deployment target.
            let filename = resource.originalFilename
            let uti = resource.uniformTypeIdentifier
            guard filename.utf8.count <= 4096, uti.utf8.count <= 1024 else { throw BridgeError("metadata_too_large") }
            return ResourceView(type: resource.type.rawValue, filename: filename, uti: uti, native: resource)
        }
        return AssetView(id: asset.localIdentifier, modified: asset.modificationDate?.timeIntervalSince1970, resources: views)
    }
    func asset(_ index: Int) throws -> AssetView {
        guard let assets = assets, index >= 0, index < assets.count else { throw BridgeError("asset_unavailable") }
        return try view(assets.object(at: index))
    }
    func refresh(_ id: String) throws -> AssetView {
        let results = PHAsset.fetchAssets(withLocalIdentifiers: [id], options: nil)
        guard let asset = results.firstObject else { throw BridgeError("asset_unavailable") }
        return try view(asset)
    }
    func read(_ resource: ResourceView, network: Bool, chunk: @escaping (Data) throws -> Void) throws {
        guard let resource = resource.native else { throw BridgeError("resource_unavailable") }
        let manager = PHAssetResourceManager.default()
        let options = PHAssetResourceRequestOptions()
        options.isNetworkAccessAllowed = network
        let done = DispatchSemaphore(value: 0)
        let state = ReadState()
        let request = manager.requestData(for: resource, options: options, dataReceivedHandler: { bytes in
            state.lock.lock()
            if state.failure == nil {
                do { try chunk(bytes) } catch { state.failure = error }
            }
            let cancel = state.failure != nil ? state.request : nil
            state.lock.unlock()
            if let cancel = cancel { manager.cancelDataRequest(cancel) }
        }, completionHandler: { error in
            state.lock.lock()
            if error != nil && state.failure == nil { state.failure = BridgeError("resource_failed") }
            state.lock.unlock()
            done.signal()
        })
        state.lock.lock(); state.request = request; let cancel = state.failure != nil; state.lock.unlock()
        if cancel { manager.cancelDataRequest(request) }
        if done.wait(timeout: .now() + 7200) == .timedOut {
            manager.cancelDataRequest(request)
            // No further command may race an abandoned callback.
            exit(3)
        }
        if let failure = state.failure { throw failure }
    }
}
final class ReadState {
    let lock = NSLock()
    var request: PHAssetResourceDataRequestID?
    var failure: Error?
}
#endif

struct Handle { let assetID: String; let revision: String; let index: Int }
final class Bridge {
    let source: Source
    var count = 0
    var generation = ""
    var handles: [String: Handle] = [:]
    init(_ source: Source) { self.source = source }
    func access() throws {
        guard ["authorized", "limited"].contains(source.status()) else { throw BridgeError("permission_required") }
    }
    func page(_ offset: Int) throws -> [String: Any] {
        guard !generation.isEmpty, offset >= 0, offset <= count, offset % pageSize == 0 else { throw BridgeError("invalid_cursor") }
        var views: [[String: Any]] = []
        for index in offset..<min(count, offset + pageSize) {
            let asset = try source.asset(index)
            let revision = try asset.revision
            var resources: [[String: Any]] = []
            for (ordinal, resource) in asset.resources.enumerated() {
                guard handles.count < maxHandles else { throw BridgeError("session_limit") }
                let key = UUID().uuidString
                handles[key] = Handle(assetID: asset.id, revision: revision, index: ordinal)
                var json = resource.json
                json["key"] = key
                // Resource size is intentionally unknown; do not use private KVC.
                resources.append(json)
            }
            views.append(["asset": asset.id, "revision": revision, "resources": resources])
        }
        let next = offset + pageSize
        return ["assets": views, "cursor": next < count ? "\(generation):\(next)" as Any : NSNull(), "scope": "visible-session-selection", "authorization": source.status()]
    }
    func run(_ request: [String: Any]) throws {
        guard let id = request["id"] as? Int, id > 0, let command = request["command"] as? String else { throw BridgeError("invalid_request") }
        var value: [String: Any]
        switch command {
        case "hello":
            #if PHOTOKIT_FIXTURE
            let fixture = true
            #else
            let fixture = false
            #endif
            value = ["protocol": 1, "fixture": fixture, "platform": "macOS", "authorizationRequests": false, "pageSize": pageSize, "maxAssets": maxAssets, "maxResourceBytes": maxResourceBytes]
        case "status": value = ["authorization": source.status(), "accessLevel": "readWrite", "operations": "read-only"]
        case "open":
            try access()
            handles.removeAll(); generation = ""; count = 0
            count = try source.open(); generation = UUID().uuidString
            value = try page(0)
        case "page":
            try access()
            guard let cursor = request["cursor"] as? String else { throw BridgeError("invalid_cursor") }
            let parts = cursor.split(separator: ":")
            guard parts.count == 2, String(parts[0]) == generation, let offset = Int(parts[1]) else { throw BridgeError("invalid_cursor") }
            value = try page(offset)
        case "read":
            try access()
            guard let key = request["key"] as? String, let handle = handles[key], let network = request["networkAllowed"] as? Bool else { throw BridgeError("invalid_selection") }
            let before = try source.refresh(handle.assetID)
            guard try before.revision == handle.revision, before.resources.indices.contains(handle.index) else { throw BridgeError("asset_changed") }
            var bytes: Int64 = 0
            var hash = SHA256()
            try source.read(before.resources[handle.index], network: network) { data in
                guard data.count <= maxResourceBytes - bytes else { throw BridgeError("resource_too_large") }
                bytes += Int64(data.count)
                hash.update(data: data)
                for offset in stride(from: 0, to: data.count, by: 49_152) {
                    let chunk = data.subdata(in: offset..<min(data.count, offset + 49_152))
                    try emit(["id": id, "kind": "chunk", "data": chunk.base64EncodedString()])
                }
            }
            guard try source.refresh(handle.assetID).revision == handle.revision else { throw BridgeError("asset_changed") }
            try access()
            value = ["bytes": bytes, "sha256": hash.finalize().map { String(format: "%02x", $0) }.joined()]
        #if PHOTOKIT_FIXTURE
        case "fixtureSet":
            let fixture = source as! FixtureSource
            if let permission = request["permission"] as? String { fixture.permission = permission }
            fixture.failure = request["failure"] as? String ?? ""
            if request["changed"] as? Bool == true { fixture.version += 1 }
            value = [:]
        #endif
        default: throw BridgeError("unknown_command")
        }
        try emit(["id": id, "kind": "result", "value": value])
    }
}

#if PHOTOKIT_FIXTURE
let bridge = Bridge(FixtureSource())
#else
let bridge = Bridge(PhotoSource())
#endif
// Avoid readLine's unlimited allocation: bound every input line before parsing.
var pending = Data()
while true {
    var buffer = [UInt8](repeating: 0, count: 4096)
    let received = Darwin.read(STDIN_FILENO, &buffer, buffer.count)
    if received < 0 { if errno == EINTR { continue }; exit(2) }
    if received == 0 { exit(pending.isEmpty ? 0 : 2) }
    pending.append(contentsOf: buffer.prefix(received))
    while let newline = pending.firstIndex(of: 10) {
        let line = pending.prefix(upTo: newline)
        guard line.count <= maxRequest else { exit(2) }
        pending.removeSubrange(...newline)
        var id = 0
        do {
            guard let request = try JSONSerialization.jsonObject(with: line) as? [String: Any] else { throw BridgeError("invalid_request") }
            id = request["id"] as? Int ?? 0
            try bridge.run(request)
        } catch {
            let code = (error as? BridgeError)?.code ?? "bridge_failed"
            do { try emit(["id": id, "kind": "error", "code": code]) } catch { exit(2) }
        }
    }
    if pending.count > maxRequest { exit(2) }
}
