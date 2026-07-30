import React from 'react';
import ReactDOM from 'react-dom';
import { Route, Switch, BrowserRouter } from 'react-router-dom';
import HomePage from './HomePage';
import SpotifyPrewrappedPage from './SpotifyPrewrappedPage';
import PrivacyPolicyPage from './PrivacyPolicyPage';
import './assets/homepage.css';

ReactDOM.render(
    <BrowserRouter>
        <Switch>
            <Route path="/spotify-prewrapped" component={SpotifyPrewrappedPage}/>
            <Route path="/privacy-policy" component={PrivacyPolicyPage}/>
            <Route path="/" component={HomePage}/>
        </Switch>
    </BrowserRouter>
  , document.getElementById('root')
);
