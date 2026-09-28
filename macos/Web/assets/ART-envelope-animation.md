# Photographic envelope animation layers — 2026-09-23

The closed appearance is the unchanged original `envelope-real-closed.png`, including its photographic crease and contact shadows. Do not replace it with a vector drawing or the generated open body.

New assets generated with the built-in image_gen tool, using the original closed PNG as the edit target:

- `envelope-real-open-body-v1.png`: empty bag with visible matching back panel, side folds and upward front pocket; 1536 × 1024.
- `envelope-real-flap-back-v1.png`: matching paper reverse face; 1536 × 1024.

Both generated files contain a rendered checker backdrop rather than usable alpha. Rendering must retain the SVG masks in envelope.js. The body mask excludes the exterior; the reverse-face texture is deliberately overscanned inside the original photographic flap contour. Do not display these PNGs directly without their masks. The original closed asset is RGBA and remains untouched.

Geometry uses original photograph coordinates, normalized from the crop `(50, 104, 1442, 816)` into SVG `objectBoundingBox` masks. Standard HTML images paint the assets for WKWebView compatibility; SVG only defines masks. The front mask traces the original photographed flap edge. Both flap faces and the closing occluder share that contour. The reverse artwork compensates the CSS horizontal back-face rotation so the actual asymmetric contour is identical when it turns over. The pivot follows the photographed hinge at y=109, avoiding a gap at the bag mouth. All IDs have unique instance prefixes. Assets are decoded once and reused; animation is CSS transforms, with no canvas loop or new process.

During the final 140 ms of closing, a foreground copy restores the original photographic contact shadow. Returning then switches directly to the original complete image, so there is no transparent crossfade exposing the open pocket through a closed flap. Reduced-motion mode skips these transitions.

## Open body prompt

Use case: precise-object-edit.
Asset type: transparent PNG layer for a photorealistic envelope-opening animation.
Edit target: the attached original cream envelope. This is a production layer, NOT a new design. Preserve its antique ivory handmade cotton paper, fine irregular fibers, warm mottling, rubbed ochre edges, gently curled paper edges, photographic top-left soft lighting and exact body size.
Change only the closed top flap: remove that entire downward-pointing top flap and its cast shadow, revealing the EMPTY envelope beneath it. Do NOT show an upward top flap: the animated flap is a separate layer. Keep the rectangular body in exactly the original location, occupying x=50..1491, y=104..919 on a 1536x1024 transparent canvas. Top hinge is the horizontal line from (55,108) to (1486,108).
The revealed envelope consists of an unbroken cream back inner panel filling this same rectangle, left and right paper side folds starting exactly at the two upper corners and sloping down toward the center, and a lower front pocket with a soft rounded upward-pointing apex around (768,510). The open mouth is a broad V-shaped opening between the side folds; show the matching subtly shaded cream inside, empty. Real folded paper, thin contact shadows just at fold edges, not a black hole. Bottom outside corners, physical width/height, aged edges and paper material must match the original closed envelope. Preserve the original exterior lower-left and lower-right exposed paper as closely as possible; this is the same envelope with its lid removed.
Camera exactly orthographic, flat, no perspective or rotation. Actual alpha transparency outside the rectangular body, same margins. No letter, no top flap above or below hinge, no wax, no stamp, no text, no props, no background, no diagram labels. One image, no panels.

## Reverse flap prompt

Use case: precise-object-edit.
Asset type: transparent PNG reverse-side flap sprite for a macOS envelope animation.
Edit target: original photorealistic vintage ivory envelope image. Extract the physical top flap only, and show the REVERSE, inside face of that exact flap lying in the same downward-pointing silhouette and image position. This is NOT a redesign. Keep the same cream handmade cotton fibers, small ochre flecks, warm age tones, soft rubbed edges and diffuse upper-left natural photographic light. The inner surface is slightly less weathered, only gently darker than the outer paper.
Composition: 1536x1024 canvas; exact straight horizontal hinge from (55,108) to (1486,108). Rounded triangular flap extends down with curved shoulders: left edge (55,108) to (73,190) to (116,241), then diagonal to (650,650), rounded soft tip centered (768,691), right edge mirrored via (886,650),(1433,241),(1470,190),(1486,108). The broad rounded triangle must match the existing original flap, including its gently rounded tip, with no extra shoulder tabs or broad outlines. Flap is at same location and scale as source. It remains pointed DOWN in the image even though it is the reverse face; code will rotate it in 3D.
Only the flap paper itself. Remove the entire envelope body, all seams of lower side folds, the backdrop, and all shadows cast onto other objects. Genuine clean transparent alpha surrounding the isolated rounded triangular flap, not white, not checkerboard, not opaque brown. No colored glue border, no stripe around edge, no wax, no stamp, no seal, no text, no letter, no labels. One image. Keep natural fine fibrous paper texture with believable thin thickness at edge.
