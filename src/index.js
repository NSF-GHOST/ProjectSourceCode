// some problems with fetch
const express = require('express'); // to build an application server or API
const app = express();
const fs = require('fs'); 
const path = require('path');
const handlebars = require('express-handlebars');
const pgp = require('pg-promise')(); // to connect to the Postgres DB from the node server
const bodyParser = require('body-parser');
const session = require('express-session'); // to set the session object. To store or access session data, use the `req.session`, which is (generally) serialized as JSON by the store.
const bcrypt = require('bcryptjs'); //  to hash passwords
const axios = require('axios'); // to make HTTP requests from our server. We'll learn more about it in Part C.
const PORT = process.env.PORT || 3001;

// configure session
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }
}));

// create `ExpressHandlebars` instance and configure the layouts and partials dir.
const hbs = handlebars.create({
    extname: 'hbs',
    layoutsDir: __dirname + '/views/layouts',
    partialsDir: __dirname + '/views/partials',
});

// database configuration
const dbConfig = {
    host: 'db', // the database server
    port: 5432, // the database port
    database: process.env.POSTGRES_DB, // the database name
    user: process.env.POSTGRES_USER, // the user account to connect with
    password: process.env.POSTGRES_PASSWORD, // the password of the user account
};

const db = pgp(dbConfig);

// test your database
db.connect()
    .then(obj => {
        console.log('Database connection successful'); // you can view this message in the docker compose logs
        obj.done(); // success, release the connection;
    })
    .catch(error => {
        console.log('ERROR:', error.message || error);
    });

// Register `hbs` as our view engine using its bound `engine()` function.
app.engine('hbs', hbs.engine);
app.set('view engine', 'hbs');
app.set('views', path.join(__dirname, 'views'));
app.use(bodyParser.json()); // specify the usage of JSON for parsing request body.

app.use(
    bodyParser.urlencoded({
        extended: true,
    })
);

app.use(express.static(__dirname + '/'));

app.get('/welcome', (req, res) => {
    res.json({ status: 'success', message: 'Welcome!' });
});

app.get('/', (req, res) => {
    res.redirect('/home');
});

/*
app.get('/home', keycloak.protect(), (req, res) => {
    res.render('pages/home', { user: req.kauth.grant.access_token.content });
});
*/

app.get('/register', (req, res) => {
    res.render("pages/register");
});


// post endpoint for the register page, processes username and password storage
app.post('/register', async (req, res) => {
    // hash the password
    const hash = await bcrypt.hash(req.body.password, 10);
    const username = req.body.username;

    // check if the username is valid (not too long, no special characters)
    if (!username || username.length > 20 || /[!#$%^&*()\/<>,\{\[\}\]\|\\]/.test(username)) {
        return res.status(400).render("pages/register", { error: true, message: "Username can not have special characters or be more than 20 characters long." });
    }
    
    const insert_query = "INSERT INTO users (username, password) VALUES ($1, $2) RETURNING *;";
    
    // insert the user into the database
    db.any(insert_query, [req.body.username, hash])
        .then(function (data) {
            res.status(200).redirect("/login");
        })
        .catch(function (err) {
            console.log(err);
            res.status(400).redirect("/register");
        })
});

app.get('/login', (req, res) => {
    res.render("pages/login");
});

// post endpoint for the login page, processes username and password verification
app.post('/login', async (req, res) => {
    const find_user = "SELECT * FROM users WHERE username = $1;";

    // try to find the user
    db.any(find_user, [req.body.username])
        .then(async function (data) {
            var user = data[0];

            // check if user exists at all before we check the password
            // redirects to register
            if (!user) {
                return res.status(400).render("pages/register", { error: true, message: "User does not exist." });
            }

            // check if the password is correct
            const match = await bcrypt.compare(req.body.password, user.password);

            // if the password is incorrect, return an error and redirect to the login page
            if (!match) {
                return res.status(400).render("pages/login", { error: true, message: "Incorrect password"});
            }
            // if the password is correct, set the session user and redirect to the home page
            else {
                req.session.user = user;
                req.session.save();
                res.status(200).redirect("/home");
            }
        })
        .catch(function (err) {
            console.log(err);
            res.status(400).render("pages/register", { error: true, message: "User does not exist.", });
        })
});

const auth = (req, res, next) => {
    if (!req.session.user) {
      // Default to login page.
      return res.redirect('/login');
    }
    next();
};

// authentication required
app.use(auth);

app.get('/home', (req, res) => {
    res.render('pages/home');
});


app.get('/mission', (req, res) => {
    res.render('pages/mission', { username: req.username });
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    // res.redirect(keycloak.logoutUrl());
});

// grab username
app.get('/username', (req, res) => {
    if (req.session && req.session.user.username) {
        res.json({ username: req.session.user.username, });
    } else {
        res.status(401).send('Unauthorized');
    }
});

// PERSONAS
// add persona
app.post('/persona', (req, res) => {
    const persona = req.body;
    const filePath = path.join(__dirname, 'personas', `persona_${Date.now()}.json`);
    fs.writeFile(filePath, JSON.stringify(persona, null, 2), (err) => {
        if (err) {
            res.status(500).send('Failed to save persona');
        } else {
            res.status(200).send('Persona saved successfully');
        }
    });
});

// delete persona

// modify persona

// save persona to folder here
app.post('/save-personas', (req, res) => {
    const personas = req.body;
    const personasFolder = path.join(__dirname, 'persona');

    if (!fs.existsSync(personasFolder)) {
        fs.mkdirSync(personasFolder);
    }

    personas.forEach(persona => {
        const safeName = persona.personaName.replace(/[^a-zA-Z0-9]/g, '_');
        const filePath = path.join(personasFolder, `${safeName}.json`);
        fs.writeFileSync(filePath, JSON.stringify(persona, null, 2));
    });

    res.status(200).json({ message: 'Personas saved successfully' });
});

// get saved personas
app.get('/get-personas', (req, res) => {
    const personasFolder = path.join(__dirname, 'persona');
    
    if (!fs.existsSync(personasFolder)) {
        return res.status(404).json({ message: 'No personas found' });
    }
    
    fs.readdir(personasFolder, (err, files) => {
        if (err) {
            return res.status(500).json({ message: 'Error reading persona directory' });
        }
        
        // Filter out only JSON files
        const personaFiles = files.filter(file => file.endsWith('.json'));
        res.json(personaFiles.map(file => file.replace('.json', '')));
    });
});

// ACTIVITY PROFILES
app.use(express.static(path.join(__dirname, 'views')));

// grab activity profile name
app.get('/activity-profiles', (req, res) => {
    const activityFolder = path.join(__dirname, 'activity');
    
    fs.readdir(activityFolder, (err, files) => {
        if (err) {
            return res.status(500).send('Unable to scan directory');
        }
        
        const profiles = files.map(file => path.parse(file).name);
        res.json(profiles);
    });
});

// grab activity profile IDs
app.get('/activity-ids', (req, res) => {
    const activitiesFolder = path.join(__dirname, 'activity');
    const activityFiles = fs.readdirSync(activitiesFolder);
    const activities = {};

    activityFiles.forEach(file => {
        if (path.extname(file) === '.json') {
            const filePath = path.join(activitiesFolder, file);
            const fileContent = fs.readFileSync(filePath, 'utf-8');
            const activity = JSON.parse(fileContent);
            activities[activity.Name] = activity; 
        }
    });

    res.status(200).json(activities);
});


// DEVICES
// add device
// delete device

// PLANS
app.post('/save-plan', (req, res) => {
    const plan = req.body;
    const plansFolder = path.join(__dirname, 'plan');

    if (!fs.existsSync(plansFolder)) {
        fs.mkdirSync(plansFolder);
    }

    const filePath = path.join(plansFolder, `plan_${plan.PlanID}.json`);
    fs.writeFileSync(filePath, JSON.stringify(plan, null, 2));

    res.status(200).json({ message: 'Plan saved successfully' });
});

app.get('/analysis', (req, res) => {
    res.render('pages/analysis');
});

/**
 * {
 *  "os": "somestring",
 *  "manufacturer": "whoever",
 *  "restorePoint": {
 *  
 *     }
 * }
 */

module.exports = app.listen(PORT); 
console.log(`Server is listening on port ${PORT}`);