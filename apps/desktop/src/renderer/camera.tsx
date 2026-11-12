import React from 'react';
import { createRoot } from 'react-dom/client';
import CameraBubbleApp from './views/CameraBubbleApp';
import './styles.css';

createRoot(document.getElementById('root')!).render(<CameraBubbleApp />);
