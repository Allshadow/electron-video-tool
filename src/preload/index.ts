import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {
  // 暴露启动下载的方法
  startDownload: (url: string) => ipcRenderer.invoke('start-download', url),

  // 暴露监听日志的方法
  onDownloadLog: (callback: (data: { type: string; message: string }) => void) => {
    const listener = (_event: any, data: any) => callback(data)
    ipcRenderer.on('download-log', listener)

    // 返回取消监听的函数
    return () => ipcRenderer.removeListener('download-log', listener)
  },

  // 选择音频/视频文件
  selectFile: () => ipcRenderer.invoke('select-file'),

  // 打开指定目录
  openPath: (dirPath: string) => ipcRenderer.invoke('open-path', dirPath),

  // 暴露音频分离的方法（输出目录由主进程计算）
  separateAudio: (inputFile: string) => ipcRenderer.invoke('separate-audio', inputFile),

  // 暴露监听分离日志的方法
  onSeparationLog: (callback: (data: { type: string; message: string }) => void) => {
    const listener = (_event: any, data: any) => callback(data)
    ipcRenderer.on('separation-log', listener)

    // 返回取消监听的函数
    return () => ipcRenderer.removeListener('separation-log', listener)
  }
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
