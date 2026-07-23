import React from 'react';
import ReactDOM from 'react-dom';
import { Route, Switch, BrowserRouter } from 'react-router-dom';
import HomePage from './HomePage';
import GeneratePage from './GeneratePage';
import './assets/homepage.css';

ReactDOM.render(
    <BrowserRouter>
        <Switch>
            <Route path="/generate" component={GeneratePage}/>
            <Route path="/" component={HomePage}/>
        </Switch>
    </BrowserRouter>
  , document.getElementById('root')
);
