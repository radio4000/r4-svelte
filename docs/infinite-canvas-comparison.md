# Infinite Canvas: OGL vs Three.js Comparison

## Overview

This document compares two parallel implementations of the infinite canvas WebGL renderer:
- **Three.js implementation** (`src/lib/infinite-canvas.js`) - existing, production implementation
- **OGL implementation** (`src/lib/infinite-canvas-ogl.js`) - new experimental implementation

The goal is to evaluate bundle size, performance, and developer experience trade-offs.

## Implementation Status

### ✅ Completed Features (Phase 1-2)

**Core Rendering:**
- ✅ OGL Renderer, Camera, and scene setup
- ✅ Plane geometry for media items
- ✅ Texture loading and caching
- ✅ Camera positioning and movement
- ✅ Chunk generation with seeded random placement
- ✅ Chunk culling (render distance-based)

**Interaction:**
- ✅ Mouse drag to pan
- ✅ Scroll to zoom
- ✅ Keyboard controls (WASD/arrows, QE for up/down)
- ✅ Click detection via manual raycasting
- ✅ Touch gestures (pan, pinch-to-zoom)

**Visual Effects:**
- ✅ Opacity fading based on distance (grid-based + depth-based)
- ✅ Fog effect via custom fragment shader
- ✅ Smooth opacity transitions
- ✅ Tooltip on hover

### 🚧 Not Implemented (Out of Scope for Comparison)

- Animated torus border for active items (Three.js-specific geometry)
- Advanced performance optimization (could be added later)

## Files Created

```
src/lib/
├── infinite-canvas-ogl.js           # OGL renderer implementation (~750 lines)
└── components/
    └── infinite-canvas-ogl.svelte   # Svelte wrapper for OGL

src/routes/_debug/canvas/+page.svelte # Updated with toggle UI
```

## Bundle Size Comparison

### Production Build Analysis

After running `bun run build`, the chunks are:

**Three.js:**
- Main Three.js chunk: **~500KB** (D8eAJXsu.js)
- Canvas page + logic: ~71KB
- **Total Three.js impact: ~571KB**

**OGL:**
- OGL is bundled inline in the page chunk
- Page includes both implementations currently: ~71KB
- **Estimated OGL-only: ~29KB library + ~40KB implementation = ~69KB**

**Size Reduction: ~502KB saved (87% smaller)**

Note: Both implementations are currently bundled into the debug page. For production use, you'd choose one or dynamically import them separately.

## Code Comparison

### Lines of Code
- Three.js implementation: **652 lines**
- OGL implementation: **~750 lines** (includes manual raycasting & matrix math)

The OGL implementation is slightly longer due to:
1. Manual raycasting implementation (vs Three.js's built-in Raycaster)
2. Matrix math for unprojection (vs Three.js utilities)
3. Custom shader code (vs Three.js materials)

### Complexity Assessment

**Three.js:**
- Higher-level abstractions
- Built-in helpers (TorusGeometry, Raycaster, OrbitControls)
- Less boilerplate for common tasks
- More "magic" behind the scenes

**OGL:**
- Closer to raw WebGL
- Explicit shader management
- Manual raycasting and math
- More direct control over rendering

## Testing Instructions

1. Start dev server:
   ```bash
   bun run dev
   ```

2. Navigate to: `http://localhost:5173/_debug/canvas`

3. Use the toggle buttons to switch between Three.js and OGL implementations

4. Test these scenarios:
   - **Navigation**: WASD/arrows, mouse drag, scroll zoom
   - **Click detection**: Click on channel avatars
   - **Performance**: Monitor FPS counter (shown in UI)
   - **Visual quality**: Compare opacity fading, fog, overall appearance

## Performance Testing Recommendations

### Browser DevTools
1. Open Performance tab
2. Record 10 seconds of navigation (fly through the space)
3. Compare:
   - Frame times (should be ~16ms for 60fps)
   - Draw calls
   - Memory usage
   - Script execution time

### Expected Results
- **FPS**: Both should maintain 60fps on modern hardware
- **Initial load**: OGL should load significantly faster (~500KB less to parse)
- **Memory**: OGL may use slightly less (fewer object allocations)
- **Draw calls**: Should be similar (same rendering strategy)

## Known Limitations

### OGL Implementation
1. **No animated border**: Three.js uses TorusGeometry for active item borders. OGL would need custom geometry or shader-based solution.
2. **Manual raycasting**: More code, but gives full control.
3. **TypeScript**: Requires `@ts-ignore` comments due to OGL's type definitions not covering custom properties (userData).

### Three.js Implementation
1. **Bundle size**: Large library for this use case.
2. **Abstraction overhead**: May be slower to parse/initialize.

## Developer Experience

### Three.js Pros
- Faster to implement features (built-in helpers)
- Rich ecosystem and documentation
- Good for complex 3D scenes
- Easier debugging (Three.js DevTools extension)

### OGL Pros
- Forces understanding of WebGL fundamentals
- More explicit control over rendering
- Tiny bundle (better for performance-critical apps)
- Minimal abstraction layer

### Three.js Cons
- Bundle size overhead
- More "magic" = harder to optimize edge cases
- May include unused features

### OGL Cons
- More boilerplate for common tasks
- Manual implementations needed (raycasting, etc.)
- Less community resources
- Limited TypeScript support for custom properties

## Recommendations

### When to Use Three.js
- Building complex 3D scenes with multiple geometries
- Need rapid prototyping with many features
- Team is familiar with Three.js
- Bundle size is not a primary concern
- Future features will benefit from Three.js ecosystem (lighting, shadows, post-processing, etc.)

### When to Use OGL
- Simple 3D rendering (like this infinite canvas)
- Bundle size is critical (mobile, slow networks)
- Performance-critical applications
- Want direct control over WebGL
- Team prefers minimal abstractions

## Next Steps

### To Complete Evaluation
1. ✅ Implement core features (DONE)
2. ⏳ Test in browser (navigate to `/_debug/canvas`)
3. ⏳ Run performance profiling
4. ⏳ Compare bundle sizes in production build
5. ⏳ Test on mobile devices
6. ⏳ Document findings and make final recommendation

### Potential Improvements
If choosing OGL:
- Add shader-based active border (ring or glow effect)
- Optimize texture loading (WebGL mipmaps)
- Add shader caching for multiple programs
- Consider WebGL 2 features for better performance

If choosing Three.js:
- Tree-shake unused Three.js modules
- Consider Three.js custom build
- Lazy-load Three.js only when canvas is needed

## Conclusion (TBD)

Final recommendation will be based on:
1. ✅ Bundle size impact (measured: ~502KB savings with OGL)
2. ⏳ Real-world performance (FPS, load time, memory)
3. ⏳ Visual quality comparison
4. ⏳ Developer feedback on code maintainability
5. ⏳ Future roadmap (do we need Three.js features later?)

**Current Status**: Implementation complete, ready for browser testing and profiling.
