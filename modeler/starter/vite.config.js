import { defineConfig } from 'vite'

 

export default defineConfig({
  root: 'src',
  publicDir: '../public',
  assetsInclude: ['**/*.xml', '**/*.txt', '**/*.svg'],
  server: {
    hmr: false,
  },
  resolve: { alias: { stream: "stream-browserify" } },
  base: './'
})