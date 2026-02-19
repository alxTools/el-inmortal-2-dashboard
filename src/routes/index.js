const express = require('express');
const router = express.Router();
const { getOne, getAll } = require('../config/database');
const { sendYoutubeOpsDailyReportEmail } = require('../utils/youtubeMetadataAudit');

// GET home page / dashboard
router.get('/', async (req, res) => {
    try {
        // Get statistics
        const stats = await getOne(`
            SELECT 
                COUNT(*) as total_tracks,
                SUM(CASE WHEN splitsheet_sent = 1 THEN 1 ELSE 0 END) as splitsheets_sent,
                SUM(CASE WHEN splitsheet_confirmed = 1 THEN 1 ELSE 0 END) as splitsheets_confirmed,
                SUM(content_count) as total_content
            FROM tracks
        `);

        // Get producers count
        const producerResult = await getOne('SELECT COUNT(*) as count FROM producers');
        const producerCount = producerResult?.count || 0;

        // Get urgent tasks count
        const urgentResult = await getOne(`
            SELECT COUNT(*) as count 
            FROM checklist_items 
            WHERE priority = 'urgent' AND completed = 0
        `);
        const urgentTasks = urgentResult?.count || 0;

        // Get pending splitsheets
        const pendingSplitsheets = (stats?.total_tracks || 0) - (stats?.splitsheets_confirmed || 0);

        // Get singles for countdown display
        const singles = await getAll(`
            SELECT t.*, p.name as producer_name
            FROM tracks t
            LEFT JOIN producers p ON t.producer_id = p.id
            WHERE t.is_single = 1
            ORDER BY t.track_number
        `);

        // Get recent activity
        const recentActivity = await getAll(`
            SELECT * FROM activity_log
            ORDER BY created_at DESC
            LIMIT 5
        `);

        // Get recent tracks (last 10 added/updated)
        const recentTracks = await getAll(`
            SELECT t.*, p.name as producer_name
            FROM tracks t
            LEFT JOIN producers p ON t.producer_id = p.id
            ORDER BY t.updated_at DESC, t.created_at DESC
            LIMIT 10
        `);

        const totalTracks = stats?.total_tracks || 0;
        const splitsheetsSent = stats?.splitsheets_sent || 0;
        const splitsheetsConfirmed = stats?.splitsheets_confirmed || 0;
        const totalContent = stats?.total_content || 0;

        res.render('index', {
            title: 'Dashboard - El Inmortal 2',
            stats: {
                totalTracks,
                totalTracksTarget: 21,
                splitsheetsSent,
                splitsheetsConfirmed,
                splitsheetsPending: pendingSplitsheets,
                totalContent,
                totalContentTarget: 63,
                producerCount,
                urgentTasks
            },
            singles: singles || [],
            recentActivity: recentActivity || [],
            recentTracks: recentTracks || [],
            launchDate: new Date('2026-02-17T00:00:00'),
            artistName: 'Galante el Emperador',
            albumName: 'El Inmortal 2',
            flash: String(req.query.flash || ''),
            defaultReportEmailTo: process.env.YT_DAILY_REPORT_TO || req.session?.user?.email || ''
        });
    } catch (error) {
        console.error('Dashboard Error:', error);
        res.status(500).render('error', {
            title: 'Error',
            message: 'Error loading dashboard',
            error: process.env.NODE_ENV === 'development' ? error : {}
        });
    }
});

router.post('/send-daily-report-email', async (req, res) => {
    const fromDate = String(req.body.from || '').trim();
    const toDate = String(req.body.to || '').trim();
    const emailTo = String(req.body.email_to || '').trim();
    const emailCc = String(req.body.email_cc || '').trim();
    const emailBcc = String(req.body.email_bcc || '').trim();
    const subject = String(req.body.subject || '').trim();

    try {
        const requestedBy = req.session?.user?.username || req.session?.user?.email || 'dashboard_user';
        const fallbackTo = req.session?.user?.email || process.env.YT_DAILY_REPORT_TO || '';

        const result = await sendYoutubeOpsDailyReportEmail({
            requestedBy,
            fromDate,
            toDate,
            to: emailTo || fallbackTo,
            cc: emailCc,
            bcc: emailBcc,
            subject
        });

        return res.redirect(`/?flash=${encodeURIComponent(`daily_report_email_ok:${result.reportDate}|to:${result.recipients.to.join(';')}`)}`);
    } catch (error) {
        console.error('Dashboard daily report email error:', error);
        return res.redirect(`/?flash=${encodeURIComponent(`daily_report_email_error:${error.message}`)}`);
    }
});

module.exports = router;
