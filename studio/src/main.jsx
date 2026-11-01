import React from 'react';
import {createRoot} from 'react-dom/client';
import {StandaloneApp} from './standalone/App';
import './styles.css';
import './standalone.css';

createRoot(document.getElementById('root')).render(<StandaloneApp fixtureBaseUrl={`${import.meta.env.BASE_URL}fixtures/`}/>);
