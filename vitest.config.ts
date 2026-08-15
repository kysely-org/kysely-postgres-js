import { isCI } from 'std-env'
import { defineConfig } from 'vitest/config'

export default defineConfig({
	test: {
		allowOnly: !isCI,
		typecheck: {
			enabled: true,
			ignoreSourceErrors: true,
		},
	},
})
