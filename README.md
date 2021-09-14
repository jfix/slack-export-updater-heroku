# What this is

This is the repository that hosts the code for a Heroku-hosted API server (previously Repl.it and Runkit) that is called when in Slack someone clicks the "Yes" or "No" export buttons.  This is more reliable (hopefully) than Repl.it's API endpoint hosting Runkit's export feature, even though there is versioning.

The URL of the Repl.it is https://slack-export-updater.herokuapp.com (POST only).  Theoretically, one could use a custom domain name for the URL, but can I be bothered? Probably. ;-)

Repl.it uses `.env` files for secrets, but they aren't committed and aren't visible to viewers of this Repl.
