import { defineConfig } from 'vitest/config'

// Só funções puras: nenhum teste aqui toca banco, rede ou API de IA.
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
})
