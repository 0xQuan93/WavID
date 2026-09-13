import React from 'react';
import {createRoot} from 'react-dom/client';
import {WavIdStudio} from './studio/WavIdStudio';
import './styles.css';
import './standalone.css';

createRoot(document.getElementById('root')).render(<WavIdStudio fixtureBaseUrl={`${import.meta.env.BASE_URL}fixtures/`}/>);
