;(async () => {
  try {
    await import(chrome.runtime.getURL('conteudo-app.mjs'))
  } catch (erro) {
    console.error('Bela na disputa (app):', erro)
  }
})()
