declare module '*.xes' {
  const content: string;
  export default content;
}

declare module '*.xes?raw' {
  const content: string;
  export default content;
}

// a more generic pattern for other file types using ?raw
declare module '*?raw' {
  const content: string;
  export default content;
}