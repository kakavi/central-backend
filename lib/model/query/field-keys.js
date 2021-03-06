// Copyright 2017 ODK Central Developers
// See the NOTICE file at the top-level directory of this distribution and at
// https://github.com/opendatakit/central-backend/blob/master/NOTICE.
// This file is part of ODK Central. It is subject to the license terms in
// the LICENSE file found in the top-level directory of this distribution and at
// https://www.apache.org/licenses/LICENSE-2.0. No part of ODK Central,
// including this file, may be copied, modified, propagated, or distributed
// except according to the terms contained in the LICENSE file.

const Option = require('../../util/option');
const { QueryOptions, withJoin, maybeFirst } = require('../../util/db');

module.exports = {
  create: (fieldKey) => ({ actors }) =>
    actors.createExtended(fieldKey, 'field_keys')
      .then((fk) => fk.createSession()
        .then((session) => fk.with({ session: Option.of(session) }))),

  getAllForProject: (project, options) => ({ fieldKeys }) =>
    fieldKeys._get(options.withCondition({ projectId: project.id })),

  getByActorIdForProject: (actorId, project, options = QueryOptions.none) => ({ fieldKeys }) =>
    fieldKeys._get(options.withCondition({ 'actors.id': actorId, projectId: project.id }))
      .then(maybeFirst),

  // joins against the actors and sessions table to return guaranteed base
  // information about those relationships that are always present.
  //
  // TODO: using modify in this way is less than elegant.
  _get: (options = QueryOptions.none) => ({ db, FieldKey, Actor, Session }) => ((options.extended === false)
    ? withJoin('fieldKey', { fieldKey: FieldKey, actor: Actor, session: Option.of(Session) }, (fields, unjoin) =>
      db.select(fields)
        .from('field_keys')
        .where(options.condition)
        .join('actors', 'field_keys.actorId', 'actors.id')
        .leftOuterJoin('sessions', 'field_keys.actorId', 'sessions.actorId')
        .where({ 'actors.deletedAt': null })
        .orderByRaw('(sessions.token is not null) desc')
        .orderBy('actors.createdAt', 'desc')
        .then((rows) => rows.map(unjoin)))

    : withJoin('fieldKey', {
      fieldKey: FieldKey.Extended,
      actor: Actor,
      createdBy: { Instance: Actor, table: 'created_by' },
      session: Option.of(Session)
    }, (fields, unjoin) =>
      db.select(fields)
        .from('field_keys')
        .where(options.condition)
        .join('actors', 'field_keys.actorId', 'actors.id')
        .join('actors as created_by', 'field_keys.createdBy', 'created_by.id')
        .leftOuterJoin('sessions', 'field_keys.actorId', 'sessions.actorId')
        .leftOuterJoin(
          db.select(db.raw('"actorId", max("loggedAt") as "lastUsed"'))
            .from('audits')
            .where({ action: 'submission.create' })
            .groupBy('actorId')
            .as('last_usage'),
          'field_keys.actorId', 'last_usage.actorId'
        )
        .where({ 'actors.deletedAt': null })
        .orderByRaw('(sessions.token is not null) desc')
        .orderBy('actors.createdAt', 'desc')
        .then((rows) => rows.map(unjoin))))
};

