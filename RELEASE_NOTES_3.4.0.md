# MeiGen MCP 3.4.0

With the MeiGen provider, call `list_models` to find the current GIF or SVG image model and its price. Use `generate_image` for animated GIFs and editable SVG originals.

For example, “生成一张猫眨眼的循环动图” uses the listed GIF model, `outputFormat: "gif"`, and optionally `gifOptions: { frameSize: "384x384", frameCount: 8, frameDurationMs: 250 }`. This makes a two-second loop. Choose a size and frame count from the model’s live limits. For “生成一个可缩放的矢量徽标”, select the SVG model and `outputFormat: "svg"`. Both formats accept a text prompt. For transparent still images, choose PNG or WebP and `imageBackground: "transparent"`.

Completed GIFs keep their animation. For SVG, `imageUrl` is the PNG preview and `vectorOutput.url` is the original. Local downloads save the requested artifact. Existing requests can still be recovered by request ID.
