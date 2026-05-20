# Database Setup

## MySQL

The project is configured for:

- Host: `127.0.0.1`
- Port: `3306`
- User: `root`
- Password: empty by default
- Database: `educore`

Create the schema:

```bash
mysql -h 127.0.0.1 -P 3306 -u root < backend/database/schema.sql
```

Seed sample data after installing dependencies:

```bash
npm run seed
```

## MongoDB

The default URI is:

```bash
mongodb://localhost:27017/educore
```

MongoDB collections are created automatically by Mongoose when seed data or application writes occur.

