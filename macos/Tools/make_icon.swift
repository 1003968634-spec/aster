// Regenerate with: swift macos/Tools/make_icon.swift macos/Web/AppIcon.iconset
import AppKit

let output = URL(fileURLWithPath: CommandLine.arguments[1])
try FileManager.default.createDirectory(at: output, withIntermediateDirectories: true)
func color(_ red: CGFloat, _ green: CGFloat, _ blue: CGFloat) -> NSColor {
    NSColor(srgbRed: red, green: green, blue: blue, alpha: 1)
}
func polygon(_ points: [NSPoint]) -> NSBezierPath {
    let path = NSBezierPath()
    path.move(to: points[0])
    for point in points.dropFirst() { path.line(to: point) }
    path.close()
    return path
}
func drawIcon(_ size: Int) -> Data {
    let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: size, pixelsHigh: size,
        bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
        colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: bitmap)
    let scale = CGFloat(size) / 1024
    let transform = AffineTransform(scale: scale)
    (transform as NSAffineTransform).concat()
    let envelope = NSBezierPath(roundedRect: NSRect(x: 72, y: 177, width: 880, height: 648), xRadius: 54, yRadius: 54)
    NSGraphicsContext.saveGraphicsState()
    let shadow = NSShadow()
    shadow.shadowColor = NSColor.black.withAlphaComponent(0.24)
    shadow.shadowBlurRadius = 35
    shadow.shadowOffset = NSSize(width: 0, height: -18)
    shadow.set()
    color(0.90, 0.84, 0.71).setFill()
    envelope.fill()
    NSGraphicsContext.restoreGraphicsState()
    envelope.addClip()
    NSGradient(starting: color(0.98, 0.95, 0.86), ending: color(0.82, 0.80, 0.72))!.draw(in: envelope, angle: -70)
    let left = polygon([NSPoint(x: 72, y: 180), NSPoint(x: 72, y: 806), NSPoint(x: 600, y: 427)])
    NSGradient(starting: color(0.91, 0.88, 0.79), ending: color(0.98, 0.94, 0.85))!.draw(in: left, angle: -40)
    let right = polygon([NSPoint(x: 952, y: 180), NSPoint(x: 952, y: 806), NSPoint(x: 424, y: 427)])
    NSGradient(starting: color(0.83, 0.82, 0.75), ending: color(0.96, 0.92, 0.82))!.draw(in: right, angle: 45)
    let bottom = polygon([NSPoint(x: 50, y: 170), NSPoint(x: 512, y: 540), NSPoint(x: 974, y: 170)])
    NSGradient(starting: color(0.94, 0.89, 0.77), ending: color(0.99, 0.96, 0.87))!.draw(in: bottom, angle: 90)
    let flap = NSBezierPath()
    flap.move(to: NSPoint(x: 55, y: 840))
    flap.line(to: NSPoint(x: 969, y: 840))
    flap.line(to: NSPoint(x: 538, y: 458))
    flap.curve(to: NSPoint(x: 486, y: 458), controlPoint1: NSPoint(x: 522, y: 445), controlPoint2: NSPoint(x: 500, y: 445))
    flap.close()
    NSGraphicsContext.saveGraphicsState()
    shadow.shadowOffset = NSSize(width: 0, height: -9)
    shadow.shadowBlurRadius = 13
    shadow.shadowColor = color(0.34, 0.29, 0.19).withAlphaComponent(0.30)
    shadow.set()
    color(0.96, 0.92, 0.83).setFill()
    flap.fill()
    NSGraphicsContext.restoreGraphicsState()
    NSGradient(starting: color(1, 0.98, 0.91), ending: color(0.91, 0.86, 0.74))!.draw(in: flap, angle: -90)
    let seal = NSBezierPath(ovalIn: NSRect(x: 412, y: 362, width: 200, height: 196))
    NSGraphicsContext.saveGraphicsState()
    shadow.shadowOffset = NSSize(width: 1, height: -8)
    shadow.shadowBlurRadius = 9
    shadow.set()
    color(0.56, 0.31, 0.27).setFill()
    seal.fill()
    NSGraphicsContext.restoreGraphicsState()
    NSGradient(starting: color(0.70, 0.43, 0.34), ending: color(0.44, 0.24, 0.22))!.draw(in: seal, angle: -80)
    let ring = NSBezierPath(ovalIn: NSRect(x: 428, y: 380, width: 168, height: 160))
    color(0.80, 0.55, 0.40).setStroke()
    ring.lineWidth = 3
    ring.stroke()
    let star = NSBezierPath()
    star.move(to: NSPoint(x: 512, y: 522))
    star.curve(to: NSPoint(x: 566, y: 460), controlPoint1: NSPoint(x: 520, y: 477), controlPoint2: NSPoint(x: 529, y: 468))
    star.curve(to: NSPoint(x: 512, y: 398), controlPoint1: NSPoint(x: 529, y: 452), controlPoint2: NSPoint(x: 520, y: 443))
    star.curve(to: NSPoint(x: 458, y: 460), controlPoint1: NSPoint(x: 504, y: 443), controlPoint2: NSPoint(x: 495, y: 452))
    star.curve(to: NSPoint(x: 512, y: 522), controlPoint1: NSPoint(x: 495, y: 468), controlPoint2: NSPoint(x: 504, y: 477))
    color(0.89, 0.72, 0.43).setFill()
    star.fill()
    NSGraphicsContext.restoreGraphicsState()
    return bitmap.representation(using: .png, properties: [:])!
}
for size in [16, 32, 128, 256, 512] {
    try drawIcon(size).write(to: output.appendingPathComponent("icon_\(size)x\(size).png"))
    try drawIcon(size * 2).write(to: output.appendingPathComponent("icon_\(size)x\(size)@2x.png"))
}
