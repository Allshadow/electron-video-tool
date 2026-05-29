import { ElectronAPI } from '@electron-toolkit/preload'

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      startDownload: (url: string) => Promise<{ status: string }>
      onDownloadLog: (callback: (data: { type: string; message: string; outputDir?: string }) => void) => () => void
      selectFile: () => Promise<{ filePaths: string[] }>
      openPath: (dirPath: string) => Promise<string>
      separateAudio: (inputFile: string) => Promise<any>
      onSeparationLog: (callback: (data: { type: string; message: string; outputDir?: string }) => void) => () => void
    }
  }
}
