import React from 'react';
import logo from './assets/logo.png';
import {Button, Space, Input, Progress} from 'antd';
import dayjs from 'dayjs';
import './assets/homepage.css';

import customParseFormat from 'dayjs/plugin/customParseFormat';
dayjs.extend(customParseFormat);

class HomePage extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            authorizationToken: '',
            week: '',
            email: '',
            generatedPlaylist: ''
        };
    }

    authorizeWithSpotify = () => {
        this.setState({authorizationToken: 'RANDOM'});
    }

    setWeek = (weekObj) => {
        this.setState({week: weekObj})
    }

    setEmail = (email) => {
        this.setState({email: email})
    }

    generatePlaylist = () => {
        this.setState({generatedPlaylist: '3LznaAI7XVhPyzp8eopWfv'})
    }

    setPercentage = () => {
        let percentage = 0;
        if (this.state.authorizationToken) percentage += 25;
        if (this.state.week) percentage += 25;
        if (this.state.email) percentage += 25;
        if (this.state.generatedPlaylist) percentage += 25;
        return percentage;
    }

    render() {
        const percentage = this.setPercentage();
        return (
            <div className="homepage-form-container">
                <div className='homepage-form'>
                    <img src={logo} className='homepage-logo' alt='logo-home'/>
                    <div className='sf-bangers-description'>SF Bangers automatically creates a new Spotify playlist each week featuring songs from artists performing in San Francisco. A fresh playlist is generated every Monday for the upcoming week.</div>
                    <div className='homepage-form-section'>
                        <div className='homepage-step-label'>Feb 1 - 7</div>
                        <div className='homepage-form-sublabel'>To find dates and venues for each artist, please visit https://foopee.com</div>

                        <iframe
                            className='generated-playlist-frame'
                            data-testid="embed-iframe"
                            style={{height: '352px'}}
                            src="https://open.spotify.com/embed/playlist/3LznaAI7XVhPyzp8eopWfv"
                            allowFullScreen=""
                            allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                            loading="lazy"
                        />
                    </div>
                    <div className='homepage-form-section'>
                        <div className='homepage-step-label'>Weekly Updates</div>
                        <div className='homepage-form-sublabel'>Enter your email to get a weekly Spotify playlist automatically added to your library, featuring artists playing concerts in the upcoming week</div>
                        <Space.Compact style={{ width: '100%' }}>
                            <Input defaultValue="Combine input and button" />
                            <Button type="primary">Submit</Button>
                        </Space.Compact>
                    </div>
                </div>
            </div>
        );
    }

}

export default HomePage;