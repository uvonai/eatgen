/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Preview,
  Text,
} from 'npm:@react-email/components@0.0.22'

interface EmailChangeEmailProps {
  siteName: string
  email: string
  newEmail: string
  confirmationUrl: string
}

export const EmailChangeEmail = ({
  siteName,
  email,
  newEmail,
  confirmationUrl,
}: EmailChangeEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Confirm your email change for Eatgen AI</Preview>
    <Body style={main}>
      <Container style={container}>
        <Img
          src="https://payenwkvrpoeurvovkli.supabase.co/storage/v1/object/public/app-assets/email%2Featgen-logo.jpg"
          width="48"
          height="48"
          alt="Eatgen AI"
          style={logo}
        />
        <Heading style={h1}>Confirm email change</Heading>
        <Text style={text}>
          You requested to change your email from{' '}
          <strong>{email}</strong> to <strong>{newEmail}</strong>.
        </Text>
        <Button style={button} href={confirmationUrl}>
          Confirm Change
        </Button>
        <Text style={footer}>
          If you didn't request this, please secure your account immediately.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default EmailChangeEmail

const main = { backgroundColor: '#ffffff', fontFamily: "'Inter', system-ui, sans-serif" }
const container = { padding: '40px 25px', maxWidth: '420px', margin: '0 auto' }
const logo = { borderRadius: '12px', marginBottom: '24px' }
const h1 = {
  fontSize: '24px',
  fontWeight: '700' as const,
  color: '#000000',
  margin: '0 0 16px',
}
const text = {
  fontSize: '15px',
  color: '#333333',
  lineHeight: '1.6',
  margin: '0 0 24px',
}
const button = {
  backgroundColor: '#000000',
  color: '#ffffff',
  fontSize: '15px',
  fontWeight: '600' as const,
  borderRadius: '16px',
  padding: '14px 28px',
  textDecoration: 'none',
}
const footer = { fontSize: '12px', color: '#a1a1aa', margin: '32px 0 0' }
