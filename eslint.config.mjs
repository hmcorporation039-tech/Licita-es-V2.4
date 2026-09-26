import js from '@eslint/js'
import tseslint from 'typescript-eslint'

// Configuração alinhada ao que o código já assumia: os comentários
// eslint-disable espalhados por src/ referenciam @typescript-eslint/no-explicit-any,
// mas o ESLint nunca esteve instalado — o script lint falhava com exit 127.
const globaisDeNode = {
  process: 'readonly',
  console: 'readonly',
  require: 'readonly',
  module: 'readonly',
  Buffer: 'readonly',
  __dirname: 'readonly',
  URL: 'readonly',
  fetch: 'readonly',
  setTimeout: 'readonly',
  setInterval: 'readonly',
}

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'web/**', 'prisma/migrations/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: globaisDeNode },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          // Permite o padrão de omitir campo por desestruturação:
          // const { campoIndesejado, ...resto } = objeto
          ignoreRestSiblings: true,
        },
      ],
    },
  }
)
