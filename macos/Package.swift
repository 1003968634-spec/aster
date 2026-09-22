// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "Aster",
    platforms: [.macOS(.v14)],
    products: [.executable(name: "Aster", targets: ["Aster"])],
    targets: [.executableTarget(name: "Aster")]
)
