import { defineConfig } from 'tsup'

export default defineConfig({
	clean: true,
	dts: true,
	entry: ['src/index.mts'],
	format: ['cjs', 'esm'],
})
