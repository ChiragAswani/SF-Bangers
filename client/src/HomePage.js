import React from 'react';
import logo from './assets/logo.png';
import {Button, Space, Input, Table, message} from 'antd';
import axios from 'axios';
import env from './env.json';
import './assets/homepage.css';

const columns = [
    {
        title: 'Playlist Link',
        dataIndex: 'dateRange',
        key: 'dateRange',
        render: (text, record) => {
            return(<a href={record.playlistId} target='_blank'>SF Bangers / {text}</a>)
        }
    }
];

class HomePage extends React.Component {
    constructor(props) {
        super(props);
        this.messageApi = message;
        this.state = {
            activePlaylistId: '',
            activePlaylistDateRange: '',
            archivedPlaylists: [],
        };
    }


    componentDidMount = async () => {
        const playlists = await axios.get(`${env.BACKEND_URL}/get-playlists`)
        const archivedPlaylists = [];
        for (const p of playlists.data) {
            if (p.isActive) {
                this.setState({activePlaylistId: p.playlistId, activePlaylistDateRange: p.dateRange});
            } else {
                archivedPlaylists.push({key: p.playlistId, dateRange: p.dateRange, playlistId: `https://open.spotify.com/playlist/${p.playlistId}`});
            }
        }
        this.setState({ archivedPlaylists });
    }

    changeWeeklyEmailSubscription = async () => {
        const email = document.getElementById('email-address').value;
        if (!email || typeof(email) !== 'string' || !email.includes('@') || email.length > 30) {
            this.messageApi.open({
                type: 'error',
                content: 'Please enter a valid email address',
            });
        } else {
            const preference = await axios.get(`${env.BACKEND_URL}/change-weekly-email-subscription?email=${email}&key=ohBE0DPCNAlRv3lU`);
            this.messageApi.open({
                type: 'success',
                content: `You have ${preference.data ? 'subscribed' : 'unsubscribed'} to weekly updates`,
            });
        }
    }

    render() {
        const {activePlaylistId, activePlaylistDateRange, archivedPlaylists} = this.state;
        return (
            <div className="homepage-form-container">
                <div className='homepage-form'>
                    <img src={logo} className='homepage-logo' alt='logo-home'/>
                    <div className='sf-bangers-description'>SF Bangers automatically creates a new Spotify playlist each week featuring songs from artists performing in San Francisco. A fresh playlist is generated every Monday for the upcoming week.</div>
                    <div className='homepage-form-section'>
                        <div className='homepage-step-label'>{activePlaylistDateRange}</div>
                        <div className='homepage-form-sublabel'>To find dates and venues for each artist, please visit https://foopee.com</div>
                        <iframe
                            className='generated-playlist-frame'
                            data-testid="embed-iframe"
                            style={{height: '352px'}}
                            src={`https://open.spotify.com/embed/playlist/${activePlaylistId}`}
                            allowFullScreen=""
                            allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                            loading="lazy"
                        />
                    </div>
                    <div className='homepage-form-section'>
                        <div className='homepage-step-label'>Weekly Updates</div>
                        <div className='homepage-form-sublabel'>Enter your email update your subscription preferences on weekly updates for any new playlists</div>
                        <Space.Compact style={{ width: '100%' }}>
                            <Input placeholder="Email Address"  id='email-address'/>
                            <Button type="primary" onClick={() => this.changeWeeklyEmailSubscription()}>Submit</Button>
                        </Space.Compact>
                    </div>
                    <div className='homepage-form-section'>
                        <div className='homepage-step-label'>Archives</div>
                        <div className='homepage-form-sublabel'>Below is a list of all previously generated playlists for artists that have performed in San Francisco</div>
                        <Table showHeader={false} columns={columns} dataSource={archivedPlaylists} bordered={true}/>
                    </div>
                </div>
            </div>
        );
    }

}

export default HomePage;