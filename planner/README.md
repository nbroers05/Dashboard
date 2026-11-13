# Planner

Own planner, separate from the dashboard. Lives at https://nbroers05.github.io/Dashboard/planner/

Without Supabase you can already look at it with fake data: https://nbroers05.github.io/Dashboard/planner/?demo

## What you do yourself (once, about 10 minutes)

The buttons in Supabase may be named slightly differently from what it says here.

1. **Account and project.** Go to https://supabase.com, create an account and a new project. Region: one in Europe (for example Frankfurt). Keep the database password you choose; the planner doesn't use it.
2. **Create the tables.** In your project open **SQL Editor**, click **New query**, paste the whole content of `planner/supabase.sql` and click **Run**. You see "Success. No rows returned". After that `planner_tasks` and `planner_subjects` are under **Table Editor**, with the RLS padlock on.
3. **Fill in the keys.** Go to **Project Settings**, then **Data API** and **API Keys**. You need the **Project URL** and the **anon public** key (in newer screens called the **publishable** key). Open https://github.com/nbroers05/Dashboard/edit/main/planner/config.js, replace `SUPABASE_URL_HERE` and `SUPABASE_ANON_KEY_HERE` (the quotes stay) and click **Commit changes**. These two may be public. Never use the **service_role** or **secret** key.
4. **Create your account.** Go to **Authentication**, then **Users**, **Add user**, **Create new user**. Fill in your email and your own password and turn on **Auto Confirm User**.
5. **Don't let anyone else sign up.** Go to **Authentication**, then **Sign In / Providers**, and turn off **Allow new users to sign up**.
6. **Log in.** Wait a minute or two and open the planner on the PC and on your phone. Log in on both with your email and password.

When new parts are added, do step 2 once more: paste the whole file again and click **Run**. Your tasks and subjects stay.

Forgot your password: in Supabase under **Authentication**, **Users** you can reset it per user.

## Google Calendar

The planner only reads your calendar; nothing goes back to Google. In a browser where the dashboard is already logged in it works right away. If it says "Calendar not linked", fill in the dashboard's passphrase. If that doesn't work, link Google again via the helper on your PC (127.0.0.1:8765/link) and make the login bundle again.

## Good to know

- You pick light or dark per device with the Theme button at the bottom. On "automatic" the planner follows your device's setting.
- Subjects come from the Canvas calendar, with the code that is between brackets there. Give them your own name in **Subjects and colors** or delete them; a renamed or deleted subject doesn't come back.
- Colors are stored in Supabase and so apply on all your devices. They are with the subjects in `planner_subjects`, as rows whose name starts with @.
- The free version of Supabase pauses a project when it hasn't been used for about a week. Then you can turn it back on with one click in the Supabase screen.
- Logging out on the dashboard clears all of the site's storage in that browser, so then you're logged out of the planner there too.
- Your tasks are only in Supabase. This repo has no planner data.
- Standard week: the button is at the bottom. Travel time to the EUR, the earliest start and dinner are provisional values you adjust there yourself. A dotted block moves along by itself; if you drag it, it's pinned. If you delete a block, it doesn't come back that week.
- The modules you already have keep their Dutch names from before 0.5.0; rename them in Standard week if you like.

## Files

| File | What |
|---|---|
| `index.html` | Layout and dialogs |
| `planner.css` | Own styles, separate from the dashboard |
| `app.js` | Screen, dragging, dialogs |
| `store.js` | Storage: Supabase, live updates, fake data for `?demo` |
| `agenda.js` | Reading Google Calendar, recognising shifts, deadlines, birthdays and F1 |
| `week.js` | Standard week: works out where the modules go, only calculation |
| `config.js` | Supabase address and anon key |
| `supabase.sql` | Tables and Row Level Security |
| `CHANGELOG.md` | Versions of the planner |
