;(async () => {
  try {
    await import(chrome.runtime.getURL('conteudo-disputa.mjs'))
  } catch (erro) {
    console.error('Bela na disputa:', erro)
  }
})()
