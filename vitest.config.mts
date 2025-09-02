import { isCI } from 'std-env'
import { defineConfig } from 'vitest/config'

export default defineConfig({
	test: {
		allowOnly: !isCI,
		globalSetup: ['./vitest.setup.mts'],
		typecheck: {
			enabled: true,
			ignoreSourceErrors: true,
		},
	},
})
