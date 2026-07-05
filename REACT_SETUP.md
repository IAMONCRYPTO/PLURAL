# PLURAL: Transitioning to React + Tailwind + TypeScript + shadcn/ui

This guide explains how to convert the vanilla PLURAL Express/HTML/JS application into a modern React application utilizing Tailwind CSS, TypeScript, and shadcn/ui.

---

## 1. Project Initialization & Tooling Setup

We recommend using **Vite** for the React + TypeScript frontend setup as it is extremely fast and aligns perfectly with shadcn/ui.

### Step 1: Create a Vite React + TypeScript Project
If you are starting clean or migrating, run the following in your terminal:
```bash
# Initialize a new Vite app with React and TypeScript in a subfolder or root
npm create vite@latest ./ -- --template react-ts
```

### Step 2: Install Tailwind CSS and its Peer Dependencies
Install Tailwind, PostCSS, and Autoprefixer, then initialize the configuration:
```bash
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

Update your `tailwind.config.js` to include template paths:
```js
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
```

Add the Tailwind directives to your main CSS file (typically `src/index.css`):
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

### Step 3: Install TypeScript Definitions
Make sure dev dependencies are updated with React types:
```bash
npm install -D @types/react @types/react-dom
```

---

## 2. Setting up shadcn/ui

### Step 1: Run the shadcn/ui CLI Initialization
Run the shadcn CLI setup command:
```bash
npx shadcn@latest init
```

You will be prompted with setup configurations:
1. **Style**: Default
2. **Base color**: Slate / Zinc
3. **CSS variables**: Yes
4. **Tailwind CSS config location**: `tailwind.config.js`
5. **Global CSS location**: `src/index.css` (or wherever your main style sheet is)
6. **Import alias for components**: `@/components`
7. **Import alias for utils**: `@/lib/utils`

### Step 2: Add Component Primitives
You can now add UI primitives like standard cards, dialogs, etc., directly:
```bash
npx shadcn@latest add card
```

---

## 3. Directory Structure & Path Conventions

### Default Path for Components and Styles
In a standard shadcn project setup:
- **Components Path**: `/components/ui/` (mapped via TypeScript alias to `@/components/ui/`)
- **Styles Path**: `src/index.css` or `src/app/globals.css`

### Why creating `/components/ui` is critical
When you initialize shadcn, it generates a `components.json` configuration file at the root. By default, it expects the directory `/components/ui` (or `src/components/ui`) for storing primitive components (like `card.tsx`, `button.tsx`, `dialog.tsx`).
- **Separation of Concerns**: Storing auto-generated primitives in `/components/ui` keeps them separate from your custom feature-level components (e.g., `/components/landing-hero.tsx` or `/components/chat-panel.tsx`).
- **CLI Dependency**: If you do not match the configured path, the CLI commands (e.g., `npx shadcn add button`) will generate a new directory or fail to resolve your imports, breaking automatic styling and updates.

---

## 4. Deploying the Spline 3D Robot in React

To use the interactive 3D robot Whobee in React:
1. Install `@splinetool/react-spline` and peer dependency `lucide-react`:
   ```bash
   npm install @splinetool/react-spline lucide-react
   ```
2. The component is already placed at `components/ui/interactive-3d-robot.tsx`.
3. You can import and place it inside any page (e.g. `App.tsx` or `LandingPage.tsx`):
   ```tsx
   import { InteractiveRobot } from './components/ui/interactive-3d-robot';

   export default function App() {
     return (
       <div className="w-full h-screen bg-slate-950 flex flex-col justify-center items-center">
         <h1 className="text-3xl text-white font-bold mb-4">Meet Whobee</h1>
         <div className="w-[500px] h-[500px]">
           <InteractiveRobot />
         </div>
       </div>
     );
   }
   ```
