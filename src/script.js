const {getArtistsForFoopeeWeek, getFoopeeConcertRangesByDate} = require('./foopee');
const {getSpotifyAccessTokenFromRefreshToken} = require('./generateSpotifyAccessToken');
const {generatePlaylistTop5PerArtist} = require('./generateSpotifyPlaylist');

(async () => {
    try {
        const dateRanges = await getFoopeeConcertRangesByDate();
        const selectedDateRange = dateRanges[1];
        const artists = await getArtistsForFoopeeWeek(selectedDateRange);
        const accessToken = await getSpotifyAccessTokenFromRefreshToken();
        const playlistTitle = `SF Bangers / ${selectedDateRange[1]}`;
        const playlistDescription = `Auto generated playlist by SF Bangers for concerts in SF from ${selectedDateRange} powered by Foopee`
        const playlistId = await generatePlaylistTop5PerArtist(accessToken, artists, playlistTitle, playlistDescription);
        console.log(playlistId);
    } catch (e) {
        console.error(e);
    }
})();