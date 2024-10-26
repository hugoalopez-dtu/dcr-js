import { defineConfig } from 'vite'

 

export default defineConfig({
  root: 'src',
  assetsInclude: ['**/*.xml', '**/*.txt'],
  server: {
    hmr: false,
  },
  resolve: { alias: { stream: "stream-browserify" } },
  base: './'
})