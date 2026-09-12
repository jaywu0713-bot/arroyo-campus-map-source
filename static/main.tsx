import React from 'react';
import { createRoot } from 'react-dom/client';
import CampusViewer from '../components/campus-viewer';
import '../app/globals.css';
createRoot(document.getElementById('root')!).render(<CampusViewer />);
