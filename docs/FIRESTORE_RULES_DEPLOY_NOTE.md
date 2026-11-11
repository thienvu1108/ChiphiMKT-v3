# Firestore rules deploy (chiphi-mkt only)

Project: `app-api-login-1b95b`  
Database: `chiphi-mkt` (named DB — NOT `(default)`)

Deploy command (from repo root):

```bash
firebase deploy --only firestore:chiphi-mkt --project app-api-login-1b95b
```

Or with firebase.json already pointing at database `chiphi-mkt`:

```bash
firebase deploy --only firestore --project app-api-login-1b95b
```

Do **not** deploy these rules to other Firebase projects (e.g. mayhomes / default DB).

## Change in this branch (revert/remove-phong-kd-mgmt)
- Removed the Phòng KD delete-lock from `budgets` delete rule (`isRoomBudgetDeleteLocked`).
  That helper defaulted a missing `status` to `da_duyet`, so if it was ever deployed it also
  blocked deleting legacy budgets without a status. The repo rule is now back to the pre-PR #13 form.
- Rules are NOT auto-deployed. If the PR #13 rules were deployed to `chiphi-mkt`, redeploy with the
  command above to lift the lock; otherwise nothing to do.

## Change in branch fix/user-dupes-link-by-email (duplicate users docs)
- `users` create by admin for SOMEONE ELSE now requires claiming `usersByEmail/{emailKey}` in the
  same batch (`adminProvisionOk`) and fails if the email already maps to an existing profile.
- First login may link a pre-provisioned / migrated profile (`migratedSourceOk`): now also rejects
  extra privileged keys not equal to the source and sources already `linkedToUid` another account.
- New `linkSourceMarkOk`: the verified owner of an email may set only `linkedToUid`/`linkedAt` on the
  source doc their `users/{uid}.migratedFromUid` points to. `linkedToUid`/`linkedAt` are privileged
  on one's own profile.
- `usersByEmail`: verified user may CREATE (not update) their own entry pointing at their uid;
  admins may read.
- Deploy rules TOGETHER WITH (or before) the app build that writes `linkedToUid` / claims
  `usersByEmail`; the app treats those writes as best-effort, so old rules only log a warning.
