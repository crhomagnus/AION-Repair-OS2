# Design System Documentation: Precision Engineering for Android AI

## 1. Overview & Creative North Star
### The Creative North Star: "The Forensic Architect"
This design system is built on the principle of **The Forensic Architect**. In the context of Android repair and AI diagnostics, the UI must feel like a high-performance laboratory—surgical, authoritative, and impossibly precise. We are moving away from the "friendly consumer" aesthetic and toward a "sophisticated utility" vibe inspired by high-end developer tools.

To break the "template" look, we utilize **intentional asymmetry** and **tonal depth**. Instead of centering everything, we use heavy left-aligned typographic anchors and expansive negative space to guide the eye through complex data. The UI doesn't just display information; it presents "findings" with the gravitas of a technical blueprint.

---

## 2. Colors: Tonal Sculpting & Radiant Accents
The palette is rooted in deep obsidian tones, utilizing high-contrast accents to highlight AI-driven insights.

### The "No-Line" Rule
Standard 1px solid borders are strictly prohibited for sectioning. Structural boundaries must be defined solely through background color shifts. For example, a `surface-container-low` section sitting on a `surface` background provides all the separation required. If a boundary feels "lost," increase the tonal contrast between containers rather than adding a stroke.

### Surface Hierarchy & Nesting
Treat the interface as a physical stack of materials.
- **Base Layer:** `surface` (#131313) or `surface-container-lowest` (#0E0E0E) for the main application canvas.
- **Intermediate Layer:** `surface-container-low` (#1C1B1B) for sidebar backgrounds or secondary navigation.
- **Top Layer:** `surface-container-high` (#2A2A2A) for active cards and focused modules.
By nesting a darker container inside a lighter one (or vice versa), we create "soft depth" that feels architectural rather than "pasted on."

### The "Glass & Gradient" Rule
For floating elements (modals, popovers, or hover states), use Glassmorphism. Utilize semi-transparent versions of `surface-container-highest` with a `backdrop-filter: blur(20px)`. Main Action CTAs should use a subtle linear gradient transitioning from `primary` (#BDC2FF) to `primary-container` (#5E6AD2) at a 135-degree angle to provide a "soulful" luminosity that a flat hex code cannot achieve.

---

## 3. Typography: Editorial Authority
The typography system balances the accessibility of **Inter** with the technical rigor of **JetBrains Mono**.

- **Display & Headlines (Inter):** Used for high-level summaries and "Hero" diagnostic stats. Set these with tight letter-spacing (-0.02em) to give the platform an editorial, authoritative feel.
- **The "Engineer" Layer (JetBrains Mono):** This is non-negotiable for terminal outputs, log files, and AI-generated code snippets. It signals to the user that they are looking at "raw" data processed by the AI.
- **Labels (Space Grotesk):** Per the typography scale, `label-md` and `label-sm` use Space Grotesk. Use this for meta-data, timestamps, and technical specs (e.g., "CPU TEMP: 42°C") to reinforce the blueprint aesthetic.

---

## 4. Elevation & Depth: Atmospheric Immersion
We eschew traditional shadows in favor of **Tonal Layering** and **Ambient Glows**.

### The Layering Principle
Depth is achieved by "stacking" surface tiers. Place a `surface-container-lowest` card on a `surface-container-low` section to create a recessed effect. This mimics the look of a high-end physical hardware console.

### Ambient Shadows & Neon Glows
When a "floating" effect is required (e.g., an active AI diagnostic module), use a shadow that mimics a light source.
- **Shadow:** Use the `on-surface` color at 6% opacity with a large 40px blur.
- **Neon Accents:** For status indicators (Repair Success, Battery Health), apply a 12px "Outer Glow" using the `secondary` (Mint Green #44F7CD) token at 30% opacity. This creates a "lit from within" feel common in premium hardware.

### The "Ghost Border" Fallback
If a border is required for accessibility, it must be a **Ghost Border**: use `outline-variant` (#454652) at 15% opacity. Never use 100% opaque borders.

---

## 5. Components

### Buttons
- **Primary:** Gradient fill (`primary` to `primary-container`), white text (`on-primary-container`), `xl` (0.75rem) corner radius.
- **Secondary:** `surface-container-highest` fill with a `secondary` (Mint Green) Ghost Border.
- **Tertiary:** Ghost button with `on-surface-variant` text; background only appears on hover.

### Chips (Diagnostic Tags)
Small, technical pills using `label-sm` (Space Grotesk). For "Critical" errors, use the `error_container` fill with a subtle 1px pulse animation.

### Cards & Lists
**Forbid the use of divider lines.** Separate list items using 12px of vertical white space or a subtle shift from `surface-container` to `surface-container-low` on alternating rows. Cards must use the `xl` (0.75rem) roundedness scale.

### Terminal/Code Blocks
Always use a `surface-container-lowest` (#0E0E0E) background. Text must be `on-surface` using **JetBrains Mono**. Use `secondary` (Mint Green) for successful command lines and `primary` (Electric Purple) for AI suggestions.

### Input Fields
Minimalist approach. Only the bottom border is visible using `outline-variant` at 20% opacity. Upon focus, the border transitions to `primary` with a subtle 4px glow.

---

## 6. Do's and Don'ts

### Do:
- **Embrace Asymmetry:** Align primary content to the left and keep technical meta-data (labels) in a structured right-hand column.
- **Use Micro-Interactions:** A subtle 2px vertical lift on card hover is better than a color change.
- **Prioritize Readability:** Ensure `on-surface-variant` text is only used for non-essential labels; use `on-surface` for all diagnostic data.

### Don't:
- **Don't use 100% Black:** Pure #000000 is too heavy. Use `surface-container-lowest` (#0E0E0E) to maintain texture.
- **Don't use Dividers:** If you feel the need to add a line, add 16px of padding instead.
- **Don't Over-Glow:** Neon glows are for status and focus only. If everything glows, nothing is important.