export {};

declare global {
  interface Window {
    electronAPI?: {
      getPathForFile: (file: File) => string | null;
      getPathForFileKey: (key: string) => string | null;
      exportSet: (payload: {
        target: 'serato' | 'rekordbox';
        setName: string;
        filePaths: string[];
      }) => Promise<{ ok: boolean; message?: string; cratePath?: string; playlistName?: string }>;
    };
  }
}
