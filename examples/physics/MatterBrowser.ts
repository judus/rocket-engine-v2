// Browser import-map bridge to Matter's packaged UMD build; Node imports its CJS package.
declare const Matter: typeof import('matter-js');
export default Matter;
