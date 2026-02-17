# API Reference (v1)

Base URL: `/api/v1`

## Authentication

Use one of:

- `x-api-key: <api_key>`
- `Authorization: Bearer <api_key>`

Master-only operations require `MCP_MASTER_API_KEY`.

## Response shape

Success:

```json
{
  "success": true,
  "data": {}
}
```

Error:

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable message",
    "details": null
  }
}
```

## System

- `GET /health` public health check
- `GET /me` returns authenticated key context
- `GET /stats` dashboard stats summary
- `POST /keys` create API key (master key only)

`POST /keys` body:

```json
{
  "name": "MCP Key",
  "company_id": 1,
  "scopes": ["albums:*", "tracks:read"]
}
```

## Albums

- `GET /albums`
- `GET /albums/:id`
- `POST /albums`
- `PUT /albums/:id`
- `DELETE /albums/:id`

Fields: `name`, `artist`, `release_date`, `status`, `description`, `cover_image_path`

## Tracks

- `GET /tracks?filter=singles|primary|album|pending`
- `GET /tracks/:id`
- `POST /tracks`
- `PUT /tracks/:id`
- `DELETE /tracks/:id`

Core fields:

- `track_number`, `title`, `album_id`, `producer_id`
- `recording_date`, `duration`, `lyrics`, `status`
- `track_type`, `is_single`, `is_primary`, `features`
- `cover_image_path`, `splitsheet_sent`, `splitsheet_confirmed`, `content_count`

## Producers

- `GET /producers`
- `GET /producers/:id`
- `POST /producers`
- `PUT /producers/:id`
- `DELETE /producers/:id`

Fields: `name`, `legal_name`, `email`, `phone`, `address`, `split_percentage`, `status`, `avatar_path`

## Composers

- `GET /composers`
- `GET /composers/:id`
- `POST /composers`
- `PUT /composers/:id`
- `DELETE /composers/:id`

Fields: `name`, `email`, `phone`, `avatar_path`

## Artists

- `GET /artists`
- `GET /artists/:id`
- `POST /artists`
- `PUT /artists/:id`
- `DELETE /artists/:id`

Fields: `name`, `email`, `phone`, `avatar_path`

## Splitsheets

- `GET /splitsheets`
- `GET /splitsheets/:id`
- `POST /splitsheets`
- `PUT /splitsheets/:id`
- `DELETE /splitsheets/:id`

Fields: `track_id`, `producer_id`, `artist_percentage`, `producer_percentage`, `status`, `notes`, `sent_date`, `confirmed_date`

## Content Calendar

- `GET /calendar`
- `POST /calendar`
- `PUT /calendar/:id`
- `DELETE /calendar/:id`

Fields: `day_number`, `date`, `title`, `content_type`, `platform`, `description`, `status`, `completed`, `track_id`

## Checklist

- `GET /checklist`
- `POST /checklist`
- `PUT /checklist/:id`
- `POST /checklist/:id/toggle`
- `DELETE /checklist/:id`

Fields: `category`, `item_text`, `priority`, `completed`, `notes`

## Upload endpoints (API Key protected)

Mounted under `/api/v1/uploads`:

- `POST /track/:id/audio`
- `POST /track/:id/audio/replace`
- `DELETE /track/:id/audio`
- `GET /track/:id/audio`
- `POST /track/:id/cover`
- `POST /album/cover`
- `POST /avatar/:type/:id`
- `GET /track/:id/log`

`type` in avatar endpoint: `producer|composer|artist`

## Bulk upload endpoints (API Key protected)

Mounted under `/api/v1/bulk-upload`:

- `GET /`
- `POST /` (multipart, `audio_files[]`)
- `POST /bulk-map`

## cURL quick examples

```bash
curl -H "x-api-key: YOUR_KEY" http://localhost:3000/api/v1/albums

curl -X POST http://localhost:3000/api/v1/tracks \
  -H "x-api-key: YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"track_number":22,"title":"Nuevo Tema","track_type":"single","is_single":1}'

curl -X POST http://localhost:3000/api/v1/checklist/15/toggle \
  -H "x-api-key: YOUR_KEY"
```
