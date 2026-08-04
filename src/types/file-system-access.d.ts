/**
 * Ambient types for the parts of the File System Access API this project uses.
 *
 * TypeScript's bundled DOM library covers `FileSystemDirectoryHandle` itself but
 * not the directory picker, the permission methods, or async iteration over a
 * directory's entries — those are still marked as an incubating proposal, so
 * they are declared here rather than pulled in as a dependency.
 *
 * Everything below is feature-detected at runtime in `folderBackup.ts`; these
 * declarations only tell the compiler what to expect where the API does exist.
 */

type FileSystemPermissionMode = "read" | "readwrite";

interface FileSystemHandlePermissionDescriptor {
  mode?: FileSystemPermissionMode;
}

interface FileSystemHandle {
  queryPermission(
    descriptor?: FileSystemHandlePermissionDescriptor,
  ): Promise<PermissionState>;
  requestPermission(
    descriptor?: FileSystemHandlePermissionDescriptor,
  ): Promise<PermissionState>;
}

interface FileSystemDirectoryHandle {
  entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
  keys(): AsyncIterableIterator<string>;
  values(): AsyncIterableIterator<FileSystemHandle>;
}

interface DirectoryPickerOptions {
  /** Groups picker sessions so the browser reopens in the same place. */
  id?: string;
  mode?: FileSystemPermissionMode;
  startIn?:
    | FileSystemHandle
    | "desktop"
    | "documents"
    | "downloads"
    | "music"
    | "pictures"
    | "videos";
}

interface Window {
  showDirectoryPicker(options?: DirectoryPickerOptions): Promise<FileSystemDirectoryHandle>;
}
