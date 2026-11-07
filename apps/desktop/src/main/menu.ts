import { Menu, app, shell } from 'electron';
import { GITHUB_URL } from '@recast/shared';

/** App menu with real ⌘ shortcuts (mac) and standard roles elsewhere. */
export function setupMenu(onAbout: () => void): void {
  const isMac = process.platform === 'darwin';
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: 'Recast',
            submenu: [
              { role: 'about' as const },
              { type: 'separator' as const },
              { role: 'services' as const },
              { type: 'separator' as const },
              { role: 'hide' as const },
              { role: 'hideOthers' as const },
              { role: 'unhide' as const },
              { type: 'separator' as const },
              { role: 'quit' as const },
            ],
          },
        ]
      : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'New Recording',
          accelerator: 'CommandOrControl+N',
          click: () => app.emit('recast:new-recording'),
        },
        { type: 'separator' },
        isMac ? { role: 'close' as const } : { role: 'quit' as const },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' as const },
        { role: 'redo' as const },
        { type: 'separator' as const },
        { role: 'cut' as const },
        { role: 'copy' as const },
        { role: 'paste' as const },
        { role: 'selectAll' as const },
        { type: 'separator' as const },
        {
          label: 'Command Palette',
          accelerator: 'CommandOrControl+K',
          click: () => app.emit('recast:command-palette'),
        },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' as const },
        { role: 'toggleDevTools' as const },
        { type: 'separator' as const },
        { role: 'resetZoom' as const },
        { role: 'zoomIn' as const },
        { role: 'zoomOut' as const },
        { type: 'separator' as const },
        { role: 'togglefullscreen' as const },
      ],
    },
    {
      label: 'Window',
      submenu: [isMac ? { role: 'minimize' as const } : { role: 'minimize' as const }, { role: 'zoom' as const }],
    },
    {
      label: 'Help',
      submenu: [
        { label: 'Documentation', click: () => void shell.openExternal(`${GITHUB_URL}#readme`) },
        { label: 'Report an issue', click: () => void shell.openExternal(`${GITHUB_URL}/issues`) },
        { type: 'separator' as const },
        { label: 'About Recast', click: onAbout },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
