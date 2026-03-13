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

interface SignupEmailProps {
  siteName: string
  siteUrl: string
  recipient: string
  confirmationUrl: string
}

export const SignupEmail = ({
  siteName,
  siteUrl,
  recipient,
  confirmationUrl,
}: SignupEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Welcome to Eatgen AI — verify your email</Preview>
    <Body style={main}>
      <Container style={container}>
        <Img
          src="https://payenwkvrpoeurvovkli.supabase.co/storage/v1/object/public/app-assets/email%2Featgen-logo.jpg"
          width="48"
          height="48"
          alt="Eatgen AI"
          style={logo}
        />
        <Heading style={h1}>Welcome to Eatgen AI</Heading>
        <Text style={text}>
          Thanks for joining! Verify your email to start scanning your food and getting personalized health insights.
        </Text>
        <Text style={textSmall}>
          Confirm your email address ({recipient}) by tapping below:
        </Text>
        <Button style={button} href={confirmationUrl}>
          Get Started
        </Button>
        <Text style={footer}>
          If you didn't create an account, you can safely ignore this email.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default SignupEmail

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
  margin: '0 0 20px',
}
const textSmall = {
  fontSize: '14px',
  color: '#71717a',
  lineHeight: '1.5',
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
