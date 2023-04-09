const {mkdir, readdir, rename, rm, writeFile, copyFile, readFile, unlink} = require('node:fs/promises')
const path = require('node:path')

;(async () => {
  const distPath = path.join(__dirname, '../dist')
  const distCjsPath = path.join(distPath, 'cjs')
  const distEsmPath = path.join(distPath, 'esm')

  const [dist, distEsm] = await Promise.all([
    readdir(distPath),
    readdir(distEsmPath),
    rm(distCjsPath, {force: true, recursive: true}),
  ])

  await Promise.all([
    mkdir(distCjsPath),
    writeFile(path.join(distEsmPath, 'package.json'), JSON.stringify({type: 'module', sideEffects: false})),
    ...dist
      .filter((distFilePath) => distFilePath.match(/\.d\.ts$/))
      .map((distFilePath) => copyFile(path.join(distPath, distFilePath), path.join(distEsmPath, distFilePath))),
    ...distEsm
      .filter((esmFilePath) => esmFilePath.match(/\.js$/))
      .map(async (esmFilePath) => {
        const distEsmFilePath = path.join(distEsmPath, esmFilePath)

        const esmFile = await readFile(distEsmFilePath)
        const esmFileContents = esmFile.toString()

        const dtsFilePath = `./${esmFilePath.replace('.js', '.d.ts')}`

        const denoFriendlyEsmFileContents = [`/// <reference types="${dtsFilePath}" />`, esmFileContents].join('\n')

        await unlink(distEsmFilePath)

        await writeFile(distEsmFilePath, denoFriendlyEsmFileContents)
      }),
  ])

  await Promise.all([
    writeFile(path.join(distCjsPath, 'package.json'), JSON.stringify({type: 'commonjs', sideEffects: false})),
    ...dist
      .filter((filePath) => filePath.match(/\.[t|j]s(\.map)?$/))
      .map((filePath) => rename(path.join(distPath, filePath), path.join(distCjsPath, filePath))),
  ])
})()
