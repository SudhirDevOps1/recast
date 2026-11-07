import React from 'react';
import { createRoot } from 'react-dom/client';
import ToolbarApp from './views/ToolbarApp';
import './styles.css';

createRoot(document.getElementById('root')!).render(<ToolbarApp />);
