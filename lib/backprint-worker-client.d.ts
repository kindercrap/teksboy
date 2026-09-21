// Vite's worker constructor import keeps asset URLs correct in Vinext's
// separately built client and SSR environments.
declare module '*?worker' {
  const WorkerConstructor: { new (): Worker };
  export default WorkerConstructor;
}
