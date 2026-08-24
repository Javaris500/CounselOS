import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { PAGINATION, type AuthUser } from '@counselos/shared';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Matter, MatterAccess } from '../../common/decorators/matter-access.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { MatterAccessContext, MatterAccessGrantRow } from './matter-access.repository';
import { MatterAccessService } from './matter-access.service';
import { TransactionsService, type Page, type TransactionDetail } from './transactions.service';
import type { ActivityRow } from './activity.repository';
import type { PartyRow, TransactionRow } from './transactions.repository';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { GrantAccessDto } from './dto/grant-access.dto';
import { ListTransactionsDto } from './dto/list-transactions.dto';
import { CreatePartyDto, UpdatePartyDto } from './dto/party.dto';
import {
  AccessParamsDto,
  PartyParamsDto,
  TransactionParamsDto,
} from './dto/transaction-params.dto';
import { UpdateStatusDto } from './dto/update-status.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';

/**
 * HTTP only — routes, DTOs, and nothing else (Architecture Rule 1).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * EVERY MATTER-SCOPED ROUTE CARRIES `@MatterAccess`. ENUMERATE BEFORE MERGING.
 *
 *   POST   /transactions                      firm-scoped — exempt, annotated
 *   GET    /transactions                      firm-scoped — exempt, annotated
 *   GET    /transactions/:id                  READ_ONLY
 *   PATCH  /transactions/:id                  FULL
 *   PATCH  /transactions/:id/status           FULL
 *   PATCH  /transactions/:id/archive          FULL
 *   GET    /transactions/:id/activity         READ_ONLY
 *   GET    /transactions/:id/parties          READ_ONLY
 *   POST   /transactions/:id/parties          FULL
 *   PATCH  /transactions/:id/parties/:partyId FULL
 *   DELETE /transactions/:id/parties/:partyId FULL
 *   GET    /transactions/:id/access           READ_ONLY
 *   POST   /transactions/:id/access           FULL
 *   DELETE /transactions/:id/access/:userId   FULL
 *
 * Twelve of the fourteen touch a matter, and twelve carry the decorator. The
 * other two have no matter to resolve against, and say so on the line.
 * The E2E hits every row of this table with an identity that must never pass.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Writes take FULL. GETs take READ_ONLY, so an attorney covering for a
 * colleague can read the matter without being able to change a legal state.
 */
@Controller('transactions')
export class TransactionsController {
  constructor(
    private readonly transactions: TransactionsService,
    private readonly access: MatterAccessService,
  ) {}

  // ── collection ─────────────────────────────────────────────────────────────

  /**
   * The transaction number is generated here-side and is not in the DTO. A
   * client that sends one is ignored, not rejected — Zod strips unknown keys.
   */
  @Roles('OWNER', 'ATTORNEY', 'PARALEGAL') // commit-check-exempt: firm-scoped create — no matter exists yet to resolve access against; CLIENT is excluded by the role gate
  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body() body: CreateTransactionDto,
  ): Promise<TransactionDetail> {
    return this.transactions.create(user, body);
  }

  /** Access is applied INSIDE the query — see MatterAccessService.listScope. */
  @Roles('OWNER', 'ATTORNEY', 'PARALEGAL') // commit-check-exempt: firm-scoped list — rows are narrowed per-caller by listScope, since there is no single matter to guard
  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query() query: ListTransactionsDto,
  ): Promise<Page<TransactionRow[]>> {
    return this.transactions.list(user, query);
  }

  // ── one matter ─────────────────────────────────────────────────────────────

  @MatterAccess('READ_ONLY')
  @Get(':id')
  findOne(
    @CurrentUser() user: AuthUser,
    @Param() params: TransactionParamsDto,
  ): Promise<TransactionDetail> {
    return this.transactions.findOne(user, params.id);
  }

  @MatterAccess('FULL')
  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param() params: TransactionParamsDto,
    @Body() body: UpdateTransactionDto,
  ): Promise<TransactionDetail> {
    return this.transactions.update(user, params.id, body);
  }

  /**
   * The dedicated status route. `PATCH /:id` cannot reach `status` at all —
   * `updateTransactionSchema` omits it — so the transition map has exactly one
   * door in front of it.
   */
  @MatterAccess('FULL')
  @Patch(':id/status')
  updateStatus(
    @CurrentUser() user: AuthUser,
    @Param() params: TransactionParamsDto,
    @Body() body: UpdateStatusDto,
  ): Promise<TransactionDetail> {
    return this.transactions.updateStatus(user, params.id, body);
  }

  @MatterAccess('FULL')
  @Patch(':id/archive')
  archive(
    @CurrentUser() user: AuthUser,
    @Param() params: TransactionParamsDto,
  ): Promise<TransactionDetail> {
    return this.transactions.archive(user, params.id);
  }

  @MatterAccess('READ_ONLY')
  @Get(':id/activity')
  activity(
    @Param() params: TransactionParamsDto,
    @Query() query: ListTransactionsDto,
  ): Promise<Page<ActivityRow[]>> {
    return this.transactions.listActivity(
      params.id,
      query.page ?? 1,
      query.limit ?? PAGINATION.DEFAULT_LIMIT,
    );
  }

  // ── parties ────────────────────────────────────────────────────────────────

  @MatterAccess('READ_ONLY')
  @Get(':id/parties')
  listParties(@Param() params: TransactionParamsDto): Promise<PartyRow[]> {
    return this.transactions.listParties(params.id);
  }

  @MatterAccess('FULL')
  @Post(':id/parties')
  addParty(
    @CurrentUser() user: AuthUser,
    @Matter() matter: MatterAccessContext,
    @Body() body: CreatePartyDto,
  ): Promise<PartyRow> {
    return this.transactions.addParty(user, matter, body);
  }

  @MatterAccess('FULL')
  @Patch(':id/parties/:partyId')
  updateParty(
    @CurrentUser() user: AuthUser,
    @Matter() matter: MatterAccessContext,
    @Param() params: PartyParamsDto,
    @Body() body: UpdatePartyDto,
  ): Promise<PartyRow> {
    return this.transactions.updateParty(user, matter, params.partyId, body);
  }

  @MatterAccess('FULL')
  @Delete(':id/parties/:partyId')
  @HttpCode(HttpStatus.OK)
  removeParty(
    @CurrentUser() user: AuthUser,
    @Matter() matter: MatterAccessContext,
    @Param() params: PartyParamsDto,
  ): Promise<{ id: string }> {
    return this.transactions.removeParty(user, matter, params.partyId);
  }

  // ── matter access (8G) ─────────────────────────────────────────────────────
  //
  // Granting takes FULL, which is exactly "OWNER, or the assigned attorney"
  // (13 §1) resolved by the guard — expressed as the access level rather than
  // as a second role check that would drift from the ladder.

  @MatterAccess('READ_ONLY')
  @Get(':id/access')
  listAccess(@Param() params: TransactionParamsDto): Promise<MatterAccessGrantRow[]> {
    return this.access.listGrants(params.id);
  }

  @MatterAccess('FULL')
  @Post(':id/access')
  grantAccess(
    @CurrentUser() user: AuthUser,
    @Matter() matter: MatterAccessContext,
    @Body() body: GrantAccessDto,
  ): Promise<MatterAccessGrantRow[]> {
    return this.access.grant(user, matter, body);
  }

  @MatterAccess('FULL')
  @Delete(':id/access/:userId')
  @HttpCode(HttpStatus.OK)
  revokeAccess(
    @CurrentUser() user: AuthUser,
    @Matter() matter: MatterAccessContext,
    @Param() params: AccessParamsDto,
  ): Promise<MatterAccessGrantRow[]> {
    return this.access.revoke(user, matter, params.userId);
  }
}
