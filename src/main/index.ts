import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { spawn, execSync } from 'child_process'

// 获取项目根目录（兼容开发模式和生产模式）
function getProjectRoot(): string {
  const appPath = app.getAppPath()
  // 开发模式: 使用 __dirname 来获取正确的项目根目录
  if (is.dev) {
    // 在开发模式下，__dirname 指向编译后的 out/main 目录
    // 需要找到包含 scripts 目录的项目根目录
    let currentDir = __dirname
    // 向上查找直到找到包含 scripts 目录的目录
    for (let i = 0; i < 5; i++) {
      const testPath = join(currentDir, 'scripts')
      if (existsSync(testPath)) {
        return currentDir
      }
      currentDir = join(currentDir, '..')
    }
    // 如果找不到，回退到 appPath 方案
    return join(appPath, '..', '..', '..')
  }
  // 生产模式: appPath 就是项目根目录
  return appPath
}

// 获取 Python 脚本路径
function getScriptPath(scriptName: string): string {
  return join(getProjectRoot(), 'scripts', scriptName)
}

// 检测可用的 Python 命令（确保 demucs 也可用）
function getPythonCommand(): string {
  const candidates = process.platform === 'win32'
    ? ['python', 'py', 'python3']
    : ['python3', 'python']

  for (const cmd of candidates) {
    try {
      // 检查 Python 是否可用
      const result = execSync(
        process.platform === 'win32' ? `where ${cmd}` : `which ${cmd}`,
        { stdio: 'pipe' }
      )
      if (!result.toString().trim()) continue

      // 检查 demucs 是否可用
      execSync(`${cmd} -m demucs --help`, { stdio: 'pipe' })
      console.log(`使用 Python: ${cmd}（demucs 可用）`)
      return cmd
    } catch {
      // 尝试下一个
    }
  }
  // 找不到带 demucs 的 Python，返回第一个可用的 Python
  for (const cmd of candidates) {
    try {
      execSync(
        process.platform === 'win32' ? `where ${cmd}` : `which ${cmd}`,
        { stdio: 'pipe' }
      )
      console.warn(`使用 ${cmd}，但 demucs 可能未安装`)
      return cmd
    } catch {
      continue
    }
  }
  console.warn('未找到可用的 Python 命令')
  return 'python'
}

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC test
  ipcMain.on('ping', () => console.log('pong'))

  // 处理文件选择请求
  ipcMain.handle('select-file', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [
        { name: '音频/视频文件', extensions: ['mp3', 'mp4', 'wav', 'flac', 'aac', 'm4a', 'avi', 'mkv', 'mov'] }
      ]
    })
    return result
  })

  // 打开指定目录
  ipcMain.handle('open-path', async (_event, dirPath: string) => {
    return shell.openPath(dirPath)
  })

  // 处理 yt-dlp 下载请求
  ipcMain.handle('start-download', async (event, url: string) => {
    try {
      // 设置下载目录为当前用户 Downloads 文件夹
      const downloadDir = join(app.getPath('downloads'), 'yt-dlp-downloads')

      // 创建下载目录（如果不存在）
      const fs = await import('fs')
      const pathModule = await import('path')
      if (!fs.existsSync(downloadDir)) {
        fs.mkdirSync(downloadDir, { recursive: true })
      }

      // 构建 yt-dlp 参数
      const args = [
        url,
        '-o', pathModule.join(downloadDir, '%(title)s.%(ext)s'),
        '--no-playlist', // 不下载播放列表
        '--merge-output-format', 'mp4', // 合并输出格式为 mp4
      ]

      // 使用环境变量中的 yt-dlp 命令
      const ytDlpCommand = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp'

      event.sender.send('download-log', {
        type: 'info',
        message: `使用命令: ${ytDlpCommand} ${args.join(' ')}`
      })

      // 启动 yt-dlp 子进程(使用 shell 选项以支持环境变量查找)
      const childProcess = spawn(ytDlpCommand, args, { shell: true })

      // 监听标准输出
      childProcess.stdout.on('data', (data) => {
        const message = data.toString().trim()
        if (message) {
          event.sender.send('download-log', { type: 'info', message })
        }
      })

      // 监听错误输出
      childProcess.stderr.on('data', (data) => {
        const message = data.toString().trim()
        if (message) {
          event.sender.send('download-log', { type: 'error', message })
        }
      })

      // 监听进程关闭
      childProcess.on('close', (code) => {
        if (code === 0) {
          const successMessage = `下载完成！文件保存在: ${downloadDir}`
          event.sender.send('download-log', {
            type: 'success',
            message: successMessage
          })

          // 下载成功后自动执行音频分离
          try {
            // 读取下载目录中的所有文件
            const files = fs.readdirSync(downloadDir)
            if (files.length > 0) {
              // 按修改时间排序,获取最新的文件
              const latestFile = files
                .map(file => ({
                  name: file,
                  time: fs.statSync(pathModule.join(downloadDir, file)).mtime.getTime()
                }))
                .sort((a, b) => b.time - a.time)[0]

              if (latestFile) {
                const videoPath = pathModule.join(downloadDir, latestFile.name)
                const separationOutputDir = pathModule.join(downloadDir, 'separated')

                event.sender.send('download-log', {
                  type: 'info',
                  message: `检测到新下载文件,开始自动分离音频: ${latestFile.name}`
                })

                // 启动音频分离
                const pythonScript = getScriptPath('audio_separator.py')
                const separationProcess = spawn(getPythonCommand(), [pythonScript, videoPath, separationOutputDir])

                let sepStdout = ''
                let sepStderr = ''

                separationProcess.stdout.on('data', (data) => {
                  const message = data.toString().trim()
                  sepStdout += message
                  if (message) {
                    event.sender.send('download-log', { type: 'info', message: `[分离] ${message}` })
                  }
                })

                separationProcess.stderr.on('data', (data) => {
                  const message = data.toString().trim()
                  sepStderr += message
                  if (message) {
                    // 判断是否为真正的错误：demucs 进度信息包含进度条或百分比
                    const isProgress = message.includes('%') || message.includes('|') || message.includes('seconds/s') ||
                                      message.includes('Separated tracks') || message.includes('Selected model')
                    const logType = isProgress ? 'info' : 'error'
                    event.sender.send('download-log', { type: logType, message: `[分离] ${message}` })
                  }
                })

                separationProcess.on('close', (sepCode) => {
                  if (sepCode === 0) {
                    event.sender.send('download-log', {
                      type: 'success',
                      message: `音频分离完成！分离文件保存在: ${separationOutputDir}`,
                      outputDir: separationOutputDir
                    })
                  } else {
                    event.sender.send('download-log', {
                      type: 'error',
                      message: `音频分离失败，退出代码: ${sepCode}`
                    })
                  }
                })

                separationProcess.on('error', (error) => {
                  event.sender.send('download-log', {
                    type: 'error',
                    message: `启动音频分离失败: ${error.message}`
                  })
                })
              }
            }
          } catch (error: any) {
            event.sender.send('download-log', {
              type: 'error',
              message: `自动分离音频时出错: ${error.message}`
            })
          }
        } else {
          event.sender.send('download-log', {
            type: 'error',
            message: `下载失败，退出代码: ${code}`
          })
        }
      })

      // 监听进程错误
      childProcess.on('error', (error) => {
        event.sender.send('download-log', {
          type: 'error',
          message: `启动 yt-dlp 失败: ${error.message}。请确保 yt-dlp 已正确安装并添加到系统 PATH`
        })
      })

      return { status: 'started' }
    } catch (error: any) {
      event.sender.send('download-log', {
        type: 'error',
        message: `下载异常: ${error.message}`
      })
      throw error
    }
  })

  // 处理音频分离请求
  ipcMain.handle('separate-audio', async (event, inputFile: string) => {
    const outputDir = join(app.getPath('home'), 'Music', 'separated')
    return new Promise((resolve, reject) => {
      const pythonScript = getScriptPath('audio_separator.py')
      const pythonCmd = getPythonCommand()

      event.sender.send('separation-log', {
        type: 'info',
        message: `开始音频分离: ${inputFile}`
      })
      event.sender.send('separation-log', {
        type: 'info',
        message: `Python 命令: ${pythonCmd}，脚本路径: ${pythonScript}`
      })

      // 启动 Python 子进程（不使用 shell 以避免路径中的特殊字符被转义）
      const childProcess = spawn(pythonCmd, [pythonScript, inputFile, outputDir])

      let stdout = ''
      let stderr = ''

      // 监听标准输出
      childProcess.stdout.on('data', (data) => {
        const message = data.toString().trim()
        stdout += message
        if (message) {
          event.sender.send('separation-log', { type: 'info', message })
        }
      })

      // 监听错误输出（demucs 将进度信息输出到 stderr）
      childProcess.stderr.on('data', (data) => {
        const message = data.toString().trim()
        stderr += message
        if (message) {
          // 判断是否为真正的错误：demucs 进度信息包含进度条或百分比，错误信息通常包含 'Error'、'error'、'Failed'、'failed'
          const isProgress = message.includes('%') || message.includes('|') || message.includes('seconds/s') ||
                            message.includes('Separated tracks') || message.includes('Selected model')
          const logType = isProgress ? 'info' : 'error'
          event.sender.send('separation-log', { type: logType, message })
        }
      })

      // 监听进程关闭
      childProcess.on('close', (code) => {
        if (code === 0) {
          // stdout 为空时（demucs 内部可能调用了 sys.exit），也视为成功
          if (!stdout.trim()) {
            event.sender.send('separation-log', {
              type: 'success',
              message: `分离完成！文件保存在: ${outputDir}`,
              outputDir
            })
            resolve({ success: true, output_dir: outputDir })
            return
          }
          try {
            // 取 stdout 最后一行作为 JSON 结果（忽略可能的多余输出）
            const lines = stdout.trim().split('\n').filter(l => l.trim())
            const jsonLine = lines[lines.length - 1]
            const result = JSON.parse(jsonLine)
            if (result.success) {
              event.sender.send('separation-log', {
                type: 'success',
                message: `分离完成！文件保存在: ${outputDir}`,
                outputDir
              })
              resolve(result)
            } else {
              event.sender.send('separation-log', {
                type: 'error',
                message: result.message
              })
              reject(new Error(result.message))
            }
          } catch (e) {
            const errorMsg = `解析结果失败，原始输出: ${stdout}`
            event.sender.send('separation-log', {
              type: 'error',
              message: errorMsg
            })
            reject(new Error(errorMsg))
          }
        } else {
          // 尝试解析 stdout 中的 JSON 错误信息
          let errorMsg = stderr || `音频分离失败，退出代码: ${code}`
          try {
            const lines = stdout.trim().split('\n').filter(l => l.trim())
            const jsonLine = lines[lines.length - 1]
            const result = JSON.parse(jsonLine)
            if (result.message) {
              errorMsg = result.message
            }
          } catch {
            // 无法解析时使用原始错误信息
          }
          event.sender.send('separation-log', {
            type: 'error',
            message: errorMsg
          })
          reject(new Error(errorMsg))
        }
      })

      // 监听进程错误
      childProcess.on('error', (error) => {
        const errorMsg = `启动 Python 失败: ${error.message}。请确保 Python 和 demucs 已正确安装`
        event.sender.send('separation-log', {
          type: 'error',
          message: errorMsg
        })
        reject(new Error(errorMsg))
      })
    })
  })

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
